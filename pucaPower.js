/*jslint browser: true, devel: true, plusplus: true, sloppy: true, unparam: true, vars: true, white: true */
var pucaPower = {

    /* ===== INTERNAL VARIABLES ===== */

    version: 'v1.0a4',
    formUrl: 'https://llamasoft.github.io/Puca-Power/controls.html',

    // Default values for internal settings
    // If you change this structure, you need to update the following:
    //   applySettingsToPage
    //   loadSettingsFromPage
    //   controls.html
    defaults: {
        reloadInterval: 60,

        alert: {
            onBundle: true,
            bundleThreshold: 500,
            colorizeBundleRows: true,
            colorizeBundleColor: '#CCFF99',

            onOutgoing: true,
            colorizeOutgoingRows: true,
            colorizeOutgoingColor: '#FFEBB5',

            playSound: true,
            soundFile: 'https://llamasoft.github.io/Puca-Power/alert.mp3',

            changeTitle: true,
            titleText: '\u2605 Trade alert! \u2605'
        },

        filter: {
            cardByValue: false,
            minCardValue: 50
        }
    },

    // Settings structures
    reloadInterval: null,
    alert: null,
    filter: null,

    // Status variables
    running: false,
    hasPlayedSound: true,

    // Handles to setTimeout()/setInterval() in case we need to stop them
    reloadTimeout: null,
    changeTimeout: null,
    titleAlertTimeout: null,

    // Selector string to pull the trade table rows
    tableStr: 'table.infinite tbody',
    tableRowStr: 'table.infinite tbody tr[id^="uc_"]',

    // Map of asynchronous events that we may need to wait on
    events: {
        tableLoadComplete: false,
        outgoingLoadComplete: false
    },

    // Array of objects of the loaded trade data
    // Each entry is {dom, memberName, memberPts, cardName, cardPts}
    tableData: [],

    // Object of objects of the table data grouped by member
    // Each object has:
    //   memberPts - The number of points the user has available
    //   cardQty - The number of cards the user wants from you
    //   totalCardPts - The sum value of all the cards the user wants from you
    //   hasAlert - A flag that's true if the user has some kind of alert (see below)
    //   hasBundleAlert - Flag the notes if the member qualifies as a trade bundle
    //   hasOutgoingAlert - Flag that notes if the member has unsent outgoing trades
    memberData: {},

    // Object of objects of the outgoing (unshipped) trades
    // Each object is {cardQty, totalCardPts}, key is memberName
    outgoingTrades: {},

    // Enable debug messages
    // debugLevel  0 - Errors and trade alerts
    // debugLevel  1 - Important messages only
    // debugLevel  2 - Semi-important messages
    // debugLevel  3 - Informational messages
    // debugLevel >3 - Probably noise
    debugLevel: 0,
    debug: function (msgLevel, msg) {
        if ( msgLevel <= this.debugLevel ) {
            console.log('[' + msgLevel + '] - ' + msg);
        }
    },



    /* ===== SETTINGS FUNCTIONS ===== */

    // Reset all settings to default values
    // Calls applySettingsToPage()
    loadDefaultSettings: function () {
        this.debug(2, 'Resetting settings to default values');

        this.reloadInterval = this.defaults.reloadInterval;
        this.alert          = this.defaults.alert;
        this.filter         = this.defaults.filter;

        this.applySettingsToPage();
    },


    // Clear local storage settings
    clearLocalSettings: function () {
        this.debug(2, 'Deleting local settings');
        delete localStorage.pucaPowerSettings;
    },

    // Save current settings to local storage
    saveSettingsToLocal: function () {
        if ( Storage === undefined ) {
            this.debug(2, 'No local storage, cannot save settings');
            this.addNote('Your settings were applied but could not be saved locally', 'text-warning');
            return;
        }

        this.debug(2, 'Saving settings to local storage');

        localStorage.pucaPowerSettings = JSON.stringify({
            version:        this.version,
            reloadInterval: this.reloadInterval,
            alert:          this.alert,
            filter:         this.filter,
            debugLevel:     this.debugLevel
        });

        this.addNote('Your settings were saved and applied', 'text-success');
    },

    // Load settings from local storage
    // Calls clearLocalSettings() on error
    loadSettingsFromLocal: function () {
        if ( Storage === undefined ) {
            this.debug(2, 'No local storage, cannot load settings');
            return;
        }

        if ( !localStorage.pucaPowerSettings ) {
            this.debug(2, 'No local settings found, skipping load');
            return;
        }

        this.debug(3, 'Loading settings from local storage');
        var settings = JSON.parse(localStorage.pucaPowerSettings);

        if ( !settings ) {
            this.debug(1, 'Failed to parse settings, purging settings');
            this.clearLocalSettings();
            return;
        }

        if ( settings.version && settings.version !== this.version ) {
            this.debug(1, 'Settings version mismatch, purging settings');
            this.clearLocalSettings();
            return;
        }

        this.reloadInterval = settings.reloadInterval;
        this.alert          = settings.alert;
        this.filter         = settings.filter;
        this.debugLevel     = settings.debugLevel;
    },


    // Load settings from controls on the page
    // Implicitly calls applySettingsToPage()
    loadSettingsFromPage: function () {
        this.debug(4, 'Loading settings from page');

        var safeParse = function (value, nanFallback, negFallback) {
            var temp = parseInt(value, 10);
            if ( isNaN(temp) ) { temp = nanFallback; }
            if (  temp <= 0  ) { temp = negFallback; }
            return temp;
        };

        this.reloadInterval = safeParse(
            $('input#reloadInterval').val(),
            this.reloadInterval,
            this.defaults.reloadInterval
        );

        // Don't be a menace
        if ( this.reloadInterval < 10 ) { this.reloadInterval = 10; }

        this.alert = {
            onBundle: $('input#alertOnBundle').prop('checked'),
            bundleThreshold:
                safeParse(
                    $('input#alertBundleThreshold').val(),
                    this.alert.bundleThreshold,
                    this.defaults.alert.bundleThreshold
                ),
            colorizeBundleRows: $('input#alertColorizeBundleRows').prop('checked'),
            colorizeBundleColor: $('input#alertColorizeBundleColor').val(),

            onOutgoing: $('input#alertOnOutgoing').prop('checked'),
            colorizeOutgoingRows: $('input#alertColorizeOutgoingRows').prop('checked'),
            colorizeOutgoingColor: $('input#alertColorizeOutgoingColor').val(),

            playSound: $('input#alertPlaySound').prop('checked'),
            soundFile: $('input#alertSoundFile').val().trim(),

            changeTitle: $('input#alertChangeTitle').prop('checked'),
            titleText: this.defaults.alert.titleText
        };

        this.filter = {
            cardByValue: $('input#filterCardsByValue').prop('checked'),
            minCardValue:
                safeParse(
                    $('input#filterCardsMinValue').val(),
                    this.filter.minCardValue,
                    this.defaults.filter.minCardValue
                )
        };

        // In case safeParse() changed anything
        this.applySettingsToPage();
    },

    // Update HTML inputs to match current settings
    // Calls updatePageState() on completion
    applySettingsToPage: function () {
        this.debug(4, 'Applying active settings to page');

        $('input#reloadInterval').val(this.reloadInterval);

        // Trade bundle settings
        $('input#alertOnBundle').prop('checked', this.alert.onBundle);
        $('input#alertBundleThreshold').val(this.alert.bundleThreshold);
        $('input#alertColorizeBundleRows').prop('checked', this.alert.colorizeBundleRows);
        $('input#alertColorizeBundleColor').val(this.alert.colorizeBundleColor);

        // Outgoing trades settings
        $('input#alertOnOutgoing').prop('checked', this.alert.onOutgoing);
        $('input#alertColorizeOutgoingRows').prop('checked', this.alert.colorizeOutgoingRows);
        $('input#alertColorizeOutgoingColor').val(this.alert.colorizeOutgoingColor);

        // Alert settings
        $('input#alertPlaySound').prop('checked', this.alert.playSound);
        $('audio#alertSound').attr('src', this.alert.soundFile);
        $('input#alertSoundFile').val(this.alert.soundFile);
        $('input#alertChangeTitle').prop('checked', this.alert.changeTitle);

        // Filter settings
        $('input#filterCardsByValue').prop('checked', this.filter.cardByValue);
        $('input#filterCardsMinValue').val(this.filter.minCardValue);

        this.updatePageState();
    },

    // Enable or disable inputs based on current options
    // Called from applySettingsToPage()
    updatePageState: function () {
        var isChecked;
        var isEnabled;

        // Alert on bundle is connected to its colorize options
        isChecked = $('input#alertOnBundle').prop('checked');
        $('input#alertBundleThreshold').prop('disabled', !isChecked);
        $('input#alertColorizeBundleRows').prop('disabled', !isChecked);
        $('input#alertColorizeBundleColor').prop('disabled', !isChecked);

        // Colorize bundle rows is connected to the color picker
        isChecked =  $('input#alertColorizeBundleRows').prop('checked');
        isEnabled = !$('input#alertColorizeBundleRows').prop('disabled');
        $('input#alertColorizeBundleColor').prop('disabled', !(isEnabled && isChecked));


        // Alert on outgoing trades is connected to its colorize option
        isChecked = $('input#alertOnOutgoing').prop('checked');
        $('input#alertColorizeOutgoingRows').prop('disabled', !isChecked);
        $('input#alertColorizeOutgoingColor').prop('disabled', !isChecked);

        // Colorize outgoing rows is connected to the color picker
        isChecked =  $('input#alertColorizeOutgoingRows').prop('checked');
        isEnabled = !$('input#alertColorizeOutgoingRows').prop('disabled');
        $('input#alertColorizeOutgoingColor').prop('disabled', !(isEnabled && isChecked));


        // The "play alert sound" option is connected to the "sound file" option
        isChecked =  $('input#alertPlaySound').prop('checked');
        $('input#alertSoundFile').prop('disabled', !isChecked);


        // The "enable filter" option is connected to the "minimum card value" option
        isChecked = $('input#filterCardsByValue').prop('checked');
        $('input#filterCardsMinValue').prop('disabled', !isChecked);
    },



    /* ===== TABLE PARSING FUNCTIONS ===== */

    // Load the trade table data into manageable structures (tableData and memberData)
    parseTradeTable: function () {
        // Don't bother parsing the data if auto-match is turned off
        if ( !$('input.niceToggle.intersect').prop('checked') ) {
            this.debug(2, 'Skipping trade table parse, auto-match is off');
            return;
        }

        this.debug(2, 'Parsing trade table data');

        this.tableData = [];
        this.memberData = {};

        // Parse all rows, hidden or not (scrolling may have added more entries)
        var tableRows = $(this.tableRowStr);

        var i;
        var curRow, curFields;
        var cardName, cardPts;
        var memberName, memberPts;

        // For each row in the trade table
        for (i = 0; i < tableRows.length; i++) {
            curRow = $(tableRows).eq(i);
            curFields = $(curRow).find('td');

            // Extract the relevant table fields
            cardName   =           $(curFields).eq(1).text().trim();
            cardPts    = parseInt( $(curFields).eq(2).text(), 10 );
            memberName =           $(curFields).eq(4).text().trim();
            memberPts  = parseInt( $(curFields).eq(5).text(), 10 );

            // Data per row
            this.tableData.push({
                dom:        curRow,
                memberName: memberName,
                memberPts:  memberPts,
                cardName:   cardName,
                cardPts:    cardPts
            });

            // Data per member
            if ( !this.memberData[memberName] ) {
                // Make a new entry
                this.memberData[memberName] = {
                    memberPts: memberPts,
                    cardQty: 1,
                    totalCardPts: cardPts,
                    hasAlert: false,
                    hasBundleAlert: false,
                    hasOutgoingAlert: false
                };

            } else {
                // Update an existing entry
                this.memberData[memberName].cardQty++;
                this.memberData[memberName].totalCardPts += cardPts;
            }
        }
    },

    // Loads the and parses the outgoing trade information
    //   into a manageable structure (outgoingTrades)
    loadOutgoingTrades: function () {
        this.debug(3, 'Fetching outgoing trades');

        // This is handled by the .ajaxSend and .ajaxComplete events
        // It's not pretty, but at least it's all in one place

        // this.events.outgoingLoadComplete = false;

        // Parse the outgoing trades table
        $.get('/trades/active', function (data) {
            var i;
            var tableRows = $(data).find('table.datatable tbody tr[id^="user_card"]:contains("Unshipped")');
            var curRow, curFields;

            var memberName;
            var cardPts;

            this.outgoingTrades = {};

            for (i = 0; i < tableRows.length; i++) {
                curRow = $(tableRows).eq(i);
                curFields = $(curRow).find('td');

                // Thank you StackOverflow! http://stackoverflow.com/a/8851526/477563
                cardPts = parseInt( $(curFields).eq(3).text(), 10 );
                memberName = $(curFields).eq(6).find('a.trader')
                             .children().remove().end().text().trim();

                if ( !this.outgoingTrades[memberName] ) {
                    this.outgoingTrades[memberName] = {
                        cardQty: 1,
                        totalCardPts: cardPts
                    };
                } else {
                    this.outgoingTrades[memberName].cardQty++;
                    this.outgoingTrades[memberName].totalCardPts += cardPts;
                }
            }
        }.bind(this));
    },



    /* ===== ALERT/NOTIFICATION FUNCTIONS ===== */

    clearAllNotes: function () {
        $('li.noteItem:not(#defaultNote)').remove();
        $('li#defaultNote').show();
    },

    getNotes: function () {
        return $('li.noteItem');
    },

    addNote: function (alertText, alertClass) {
        this.debug(3, 'Adding alert item: ' + alertText);

        $('li#defaultNote').hide();
        $('ul#noteList').append( $('<li class="noteItem">').html(alertText).addClass(alertClass) );
    },

    setTitleAlert: function (msg, delay) {
        if ( this.titleAlertTimeout ) { return; }
        if ( delay === undefined ) { delay = 5000; }

        if ( this.alert.changeTitle ) {
            this.origTitle = document.title;
            document.title = msg;

            this.titleAlertTimeout = setTimeout(this.removeTitleAlert.bind(this), delay);
        }
    },

    removeTitleAlert: function () {
        this.titleAlertTimeout = null;
        document.title = this.origTitle;
    },

    playAlertSound: function () {
        if ( this.alert.playSound && !this.hasPlayedSound ) {
            $('audio#alertSound').trigger('play');
            this.hasPlayedSound = true;
        }
    },

    checkForAlerts: function () {
        this.debug(2, 'Checking for alerts');

        var i;
        var pendingAlerts = [];
        var curAlert = {}; // { msg, style, weight }

        var memberName, memberPts;
        var cardQty, totalCardPts;
        var tradeValue;

        var rowColor;


        // First iterate the individual members
        for (i in this.memberData) {
            if ( !this.memberData.hasOwnProperty(i) ) { continue; }

            memberName   = i;
            memberPts    = this.memberData[i].memberPts;
            cardQty      = this.memberData[i].cardQty;
            totalCardPts = this.memberData[i].totalCardPts;

            // The bundle is only worth what the member can actually pay for
            tradeValue = Math.min(totalCardPts, memberPts);
            curAlert = {};


            // Does this qualify as a bundle alert?
            if ( this.alert.onBundle && tradeValue >= this.alert.bundleThreshold ) {
                this.memberData[i].hasAlert = true;
                this.memberData[i].hasBundleAlert = true;

                // Queue the alert
                // If the trade value is limited by the user's points, mark the entry
                curAlert = {
                    msg: '<strong>' + memberName + ' (' + memberPts + ' points)</strong> wants '
                        + cardQty + ' cards for <strong>' + totalCardPts + ' points</strong>',
                    style: (totalCardPts > memberPts ? 'text-warning' : ''),
                    weight: tradeValue
                };
            }


            // Does this member have outgoing trades?
            // If a user qualifies for bundle and outgoing alerts, the outgoing always has higher priority.
            if ( this.alert.onOutgoing && this.outgoingTrades[memberName] !== undefined ) {
                this.memberData[i].hasAlert = true;
                this.memberData[i].hasOutgoingAlert = true;

                // The value is increased by how much we're already sending them
                tradeValue += this.outgoingTrades[memberName].totalCardPts;

                curAlert = {
                    msg: '<strong>' + memberName + ' (' + memberPts + ' points)</strong> '
                        + 'has outgoing trades and wants ' + cardQty + ' more cards for '
                        + '<strong>' + totalCardPts + ' points</strong>',
                    style: (totalCardPts > memberPts ? 'text-warning' : ''),
                    weight: tradeValue
                };
            }


            if ( curAlert.msg !== undefined ) {
                pendingAlerts.push(curAlert);
                this.debug(1, 'Alert! ' + curAlert.msg);
            }
        }


        // Iterate the table elements and colorize alerts
        for (i = 0; i < this.tableData.length; i++) {
            memberName = this.tableData[i].memberName;
            rowColor = null;

            if ( this.memberData[memberName].hasAlert ) {
                // Reveal the row if previously hidden by filtering
                $(this.tableData[i].dom).show();
                $(this.tableData[i].dom).data("hasAlert", true);


                // Colorize if part of a bundle
                if ( this.alert.colorizeBundleRows && this.memberData[memberName].hasBundleAlert ) {
                    rowColor = this.alert.colorizeBundleColor;
                }

                // Colorize if has outgoing trades (will override bundle)
                if ( this.alert.colorizeOutgoingRows && this.memberData[memberName].hasOutgoingAlert ) {
                    rowColor = this.alert.colorizeOutgoingColor;
                }


                if ( rowColor !== null ) {
                    $(this.tableData[i].dom).find('td').css('background-color', rowColor);
                }
            }
        }


        if ( pendingAlerts.length > 0 ) {
            this.playAlertSound();
            this.setTitleAlert(this.alert.titleText);
        }

        // Sort the alerts by weight
        pendingAlerts.sort(function (a, b) { return (b.weight - a.weight); });

        // Display the alerts, highest weight first
        for (i = 0; i < pendingAlerts.length; i++) {
            this.addNote(pendingAlerts[i].msg, pendingAlerts[i].style);
        }
    },



    /* ===== FILTER FUNCTIONS ===== */

    filterTrades: function () {
        this.debug(2, 'Filtering trades');
        var i;
        var filterQty = 0;
        var memberName;
        var cardName;
        var cardPts;
        var hasAlert;

        for (i = 0; i < this.tableData.length; i++) {
            memberName = this.tableData[i].memberName;
            cardName = this.tableData[i].cardName;
            cardPts = this.tableData[i].cardPts;
            hasAlert = this.memberData[memberName].hasAlert;

            // Skip entries that have pending alerts
            if ( hasAlert ) { continue; }

            // Filter cards by value
            if ( this.filter.cardByValue && cardPts < this.filter.minCardValue ) {
                this.debug(4, 'Filtering trade: ' + cardName + ' (' + cardPts + ')');
                $(this.tableData[i].dom).hide();
                filterQty++;
            }
        }

        if ( filterQty > 0 ) {
            this.addNote('Filtered ' + filterQty + ' trades', 'muted');
        }

        // Update the "Total" label on the table
        $('p#total').text('Total: ' + (this.tableData.length - filterQty));
    },



    /* === DRIVER FUNCTIONS === */

    // Initiate trade data refresh
    go: function () {
        this.debug(1, 'Reloading table data');

        // Reload settings in case something changed
        this.loadSettingsFromPage();

        this.running = true;
        this.reloadTimeout = null;
        this.hasPlayedSound = false;

        $('button#start').removeClass('btn-success');
        $('button#stop').addClass('btn-danger');

        // Auto-match must be on, otherwise things get weird with alerts and filtering.
        if ( !$('input.niceToggle.intersect').prop('checked') ) {
            this.debug(2, 'Enabling auto-match');
            $('input.niceToggle.intersect').prop('checked', true);
            $('label.niceToggle.intersect').addClass('on');
            
            // lastVars may or may not be defined yet
            window.lastVars = $.extend({ intersect: true }, window.lastVars);
        }
        
        loadTableData();
    },

    // The trade table finished updating and we can now load the data
    // This can also be triggered by the infinite table having data added
    reloadComplete: function () {
        // We will be called multiple times from the .ajaxComplete handler
        //   but we will only run once (when all of the events are ready)
        if ( !this.events.tableLoadComplete || !this.events.outgoingLoadComplete ) { return; }

        this.clearAllNotes();
        this.checkForAlerts();
        this.filterTrades();

        // Repeat if 1) we're running, 2) we don't have a reload pending, 3) the reload interval is positive
        if (this.reloadInterval > 0 && !this.reloadTimeout && this.running) {
            this.reloadTimeout = setTimeout(this.go.bind(this), this.reloadInterval * 1000);
            this.debug(4, 'Refresh timeout set, handle = ' + this.reloadTimeout);
        }
    },

    // Stop the reload, clear the reload handle
    stop: function () {
        this.debug(1, 'Stopping table reload');

        this.running    = false;
        this.hasAlerted = true;

        $('button#start').addClass('btn-success');
        $('button#stop').removeClass('btn-danger');

        if (this.reloadTimeout) {
            clearTimeout(this.reloadTimeout);
            this.reloadTimeout = null;
        }
    },


    /* === SETUP FUNCTIONS === */

    // Responsible for setting up event listeners and handlers
    setupListeners: function () {
        // Disable the infinite scroll feature (sorry)
        // It spams AJAX requests whenever the user scrolls down the page
        $(this.tableStr).infinitescroll('unbind');


        // Whenever loadTableData is called we need to reload our list of outgoing trades.
        // The cleanest way of doing this is to hook the .ajaxSend() event.
        $(document).ajaxSend(function (e, xhr, settings) {
            var url = settings.url;
            this.debug(4, '.ajaxSend - ' + url);

            // Suppress fancybox loading animation
            $.fancybox.hideLoading();

            // Specifically allow /trades/active
            // This is us calling loadOutgoingTrades()
            if ( url.indexOf('/trades/active') !== -1 ) {
                this.events.outgoingLoadComplete = false;
                return;
            }

            // Ignore anything else under /trades/
            // This includes the card sending and confirmation dialogs
            if ( url.indexOf('/trades/') !== -1 ) { return; }


            // This is something - maybe us, maybe not - calling loadTableData()
            // We've already excluded /trades/, so this can only be a simple
            //   reload or applying a reload with settings (e.x /trades?search=str)
            if ( url.indexOf('/trades') !== -1 ) {
                this.events.tableLoadComplete = false;
                this.loadOutgoingTrades();
                return;
            }
        }.bind(this));


        // Whenever loadTableData or loadOutgoingTrades finishes we need to know about it.
        $(document).ajaxComplete(function (e, xhr, settings) {
            var url = settings.url;
            this.debug(4, '.ajaxComplete - ' + url);

            // Specifically allow /trades/active
            // This is us calling loadOutgoingTrades()
            if ( url.indexOf('/trades/active') !== -1 ) {
                this.events.outgoingLoadComplete = true;
                this.reloadComplete();
                return;
            }

            // Ignore anything else under /trades/
            // This includes the card sending and confirmation dialogs
            if ( url.indexOf('/trades/') !== -1 ) { return; }


            // This is something - maybe us, maybe not - calling loadTableData()
            // We've already excluded /trades/, so this can only be a simple
            //   reload or applying a reload with settings (e.x /trades?search=str)
            if ( url.indexOf('/trades') !== -1 ) {
                this.parseTradeTable();
                this.events.tableLoadComplete = true;
                this.reloadComplete();
                return;
            }
        }.bind(this));


        // Button and input listeners to keep the settings form pretty
        $('button#start').click(function () {
            this.addNote('Refresh started', 'text-success');
            this.go();
        }.bind(this));
        $('button#stop').click(function () {
            this.addNote('Refresh stopped', 'text-warning');
            this.stop();
        }.bind(this));

        $('button#save').click(function () {
            this.loadSettingsFromPage();
            this.saveSettingsToLocal();
        }.bind(this));
        $('button#reset').click(this.loadDefaultSettings.bind(this));

        $('input#alertOnBundle').click(this.updatePageState.bind(this));
        $('input#alertColorizeBundleRows').click(this.updatePageState.bind(this));

        $('input#alertOnOutgoing').click(this.updatePageState.bind(this));
        $('input#alertColorizeOutgoingRows').click(this.updatePageState.bind(this));

        $('input#alertPlaySound').click(this.updatePageState.bind(this));
        $('i#alertPreviewSound').click(function () {
            this.loadSettingsFromPage();
            $('audio#alertSound').trigger('play');
        }.bind(this));

        $('input#filterCardsByValue').click(this.updatePageState.bind(this));

    },

    // Responsible for initial loading and setup
    setup: function () {
        if ( window.location.href.toLowerCase().indexOf('pucatrade.com') === -1 ) {
            alert('Hey!  This doesn\'t look like PucaTrade!');
            return this;
        }

        if ( window.location.href.toLowerCase().indexOf('pucatrade.com/trades') === -1 ) {
            alert('Hey!  This isn\'t the Trades section!');
            return this;
        }


        // Required styling options
        $('<style id="pucaPowerCSS" type="text/css"></style>').appendTo('head');
        $('style#pucaPowerCSS').append('.noteItem { list-style: disc inside !important; }');


        // Load the user's settings (if possible)
        this.loadDefaultSettings();
        this.loadSettingsFromLocal();

        // Disable AJAX caching
        $.ajaxSetup({ cache: false });

        // Add the settings form by clobbering the help text
        $('div.explain-text').load(this.formUrl, function () {
            this.debug(1, 'Input form loaded');

            this.applySettingsToPage();

            this.setupListeners();

            $('#pucaPowerVersion').text(this.version);

        }.bind(this));


        return this;
    }
}.setup();