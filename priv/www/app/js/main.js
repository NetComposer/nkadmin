(function(){
	
	logic = (function(){
        var host = "ovh.jaraxa.com";
	    var port = 443;
        var pathname = '/_admin';
        var path = '_api/ws';
        var useWss = true;
        var defaultDomain = "/";
	    var lsNcLogin = "nc-admin-login";
	    var lsNcPwd = "nc-admin-pwd";
	    var roomPath = undefined;
	    var roomUrl = "/sfu/#room/";
	    var roomView = "/present";
        var currentPath = "/";
        var currentPathIds = "/";
        var currentURL = "/";
        var currentHash = "#/";
        var currentURLId = null;
        var currentDomainId = null;
        var currentBreadcrumbs = null;
        var currentDetailId = null;
        var wsError = "";
        var loggedOut = false;
        var userId = null;
        var sessionId = null;
        var adminSessionId = null;
        var treeIds = [];

        // Constants
        var SEPARATOR = "_";

        var ADMIN_FRAME = "admin_frame";
        var ADMIN_FRAME_DOMAIN_ICON = "admin_frame_domain_icon";
        var ADMIN_FRAME_DOMAIN_NAME = "admin_frame_domain_name";
        var ADMIN_FRAME_USER_NAME = "admin_frame_user_name";
        var ADMIN_FRAME_USER_ICON = "admin_frame_user_icon";
        var ADMIN_FRAME_USER_MENU = "admin_frame_user_menu";

        var DOMAIN_TREE = "domain_tree";
    
        // Frame state:
        var frameState = {
            ADMIN_FRAME: {},
            ADMIN_FRAME_DOMAIN_ICON: {},
            ADMIN_FRAME_DOMAIN_NAME: {},
            ADMIN_FRAME_USER_NAME: {},
            ADMIN_FRAME_USER_ICON: {},
            ADMIN_FRAME_USER_MENU: {}
        };

        function init(_defaultDomain) {
            var hostname = window.location.hostname;
            var defaultLanguage = "es";
            defaultDomain = _defaultDomain;

            webix.ready(function(){
                // This custom scroll fails if a mouse is connected
/*
                if (!webix.env.touch && webix.ui.scrollSize) {
                    // Enable webix custom scroll (Pro feature)
                    webix.CustomScroll.init();
                }
*/
            });
            // Initialize an empty workspace
            webix.ui(createEmptyWorkspace());

            // Use current location to set the ws connection
            hostname = window.location.hostname;
            // 'localhost', 'v1.netc.io', 'ovh.jaraxa.net', ...
            host = hostname;
            // 9202, 443, 80, ...
            port = window.location.port;
            // https: -> wss:, http: -> ws:
            useWss = window.location.protocol === 'https:';
            // '/admin/', '/netcomp/v01/admin/', ...
            pathname = window.location.pathname;
            if (pathname.length > 1 && pathname.charAt(pathname.length-1) === '/') {
                // '/admin', '/netcomp/v01/admin', ...
                pathname = pathname.substring(0, pathname.length-1);
            }
            // '/', '/netcomp/v01/', ...
            var parentPath = window.location.pathname.split('_admin')[0];
            // 'api/ws', 'netcomp/v01/api/ws', ...
            path = pathname.substring(1,parentPath.length) + '_api/ws';
            console.log('Connecting to: ', hostname, host, port, useWss, path, parentPath, pathname);

            if (host === 'localhost' && port === '8001') {
                // If it's a local test environment, use the default port instead
                port = '9304';
            }

            var href = window.location.href.split("/");
            var relativePath = href[0] + "//" + href[2];
            roomPath = relativePath.concat(roomUrl);

            document.addEventListener("onWsOpen", function(response) {
                console.log("Websocket opened");
                ncLogin = localStorage.getItem(lsNcLogin);
                ncPass = localStorage.getItem(lsNcPwd);

                if (ncLogin && ncPass
                    && ncLogin !== "null" && ncPass !== "null") {
                    doLogin(ncLogin, ncPass, defaultDomain);
                } else {
                    $$("login-popup").show();
                    $$("userLogin").focus();
                }
                $$("workspace").enable();
            }, this);

            document.addEventListener("onWsClose", function(response) {
                console.log("Websocket closed");
                if (window.localStorage) {
                    // Commented to ease development
                    //localStorage.removeItem(lsNcLogin);
                    //localStorage.removeItem(lsNcPwd);
                }
                clearWorkspace();
                $$("workspace").disable();
        	    $$(ADMIN_FRAME_USER_MENU).hide();
            	$$("login-popup").destructor();
    		    webix.ui(loginPopup);
    	    	$$("login-popup").show();
            	$$("userLogin").focus();
                if (!loggedOut) {
                    $$("loginError").setHTML("Websocket connection lost!");
                    console.log("onWsClose: ", response);
                } else if (wsError !== "") {
                    $$("loginError").setHTML(wsError);
                    wsError = "";
                }
            });

            document.addEventListener("loginSuccessEvent", function(response) {
                loggedOut = false;
                var data = response.detail[0].data;

                console.log("loginSuccessEvent: ", response, "data: ", data);

                // Save user obj_id
                userId = data.obj_id;
                sessionId = data.session_id;
                console.log("userId: ", userId, "sessionId: ", sessionId);

                if (window.localStorage) {
                    localStorage.setItem(lsNcLogin, ncLogin);
                    localStorage.setItem(lsNcPwd, ncPass);
                }
            }, this);

            document.addEventListener("loginErrorEvent", function(response) {
                console.log("loginErrorEvent: ", response);

                if (window.localStorage) {
                    localStorage.removeItem(lsNcLogin);
                    localStorage.removeItem(lsNcPwd);
                }
                //$$("login-popup").show();
                //$$("userLogin").focus();
                wsError = response.detail[0].data.error;
                // Closing the websocket on login error
                loggedOut = true;
                ncClient.close();
            });

            document.addEventListener("sessionStartedEvent", function(response) {
                var data = response.detail[0].data;

                console.log("sessionStartedEvent");
                console.log(data);

                adminSessionId = data.obj_id;
                console.log("adminSessionId: ", adminSessionId);

                // Define a custom data filter
                webix.ui.datafilter.extendedFilter = webix.extend({
                    refresh:function(master, node, column){
                        //event handlers
                        node.onclick = function(e) {
                            // Prevent the column from changing the order when clicking the filter
                            e.stopPropagation();
                        };
                        node.onkeyup = function(){
                            let input = this.children[0].children[0];
                            if (input.prevValue !== input.value) {
                                console.log('Filter ' + column.columnId + ' changed: ' + input.value);
                                // This clears datatable before showing the results
                                //master.clearAll();
                                let newObj = {
                                    //id: "message-2MGj5cA4hqD8xdFNhCGS2cjrTjH", // This id value is used to detect content change
                                    id: "message-Sw0QWMpRzOKt3BE0c0AoZHe6ep3", // This id value is used to detect content change
                                    path: "/conversations/channel1/messages/2MGj5cA",
                                    conversation: "conversation-1oeOM3nHwthFVxWkFEExdioMZjF",
                                    text: "Doce -> ¡La duodécima!",
                                    hasFile: false,
                                    createdBy: "user-U3qSXUo8MWC4e56H0ua7BQmNGYm",
                                    createdTime: 1496733894433
                                };
                                if (column.columnId === 'path') {
                                    newObj.path = input.value;
                                } else if (column.columnId === 'conversation') {
                                    newObj.conversation = input.value;
                                } else if (column.columnId === 'text') {
                                    newObj.text = input.value;
                                } else if (column.columnId === 'hasFile') {
                                    newObj.hasFile = input.value;
                                } else if (column.columnId === 'createdBy') {
                                    newObj.createdBy = input.value;
                                } else if (column.columnId === 'createdTime') {
                                    newObj.createdTime = input.value;
                                }
                                //master.markSorting(column.columnId, 'asc');
                                //master.markSorting(column.columnId, 'desc');
                                master.markSorting('path', 'desc');
                                master.markSorting('conversation', 'desc');
                                master.markSorting('text', 'desc');
                                //master.add(newObj, 0);
                                master.parse([newObj], "json");
                                // master.
                            };
                            input.prevValue = input.value;
                        }
                    }
                }, webix.ui.datafilter.textFilter);

                webix.ui.datafilter.customMasterCheckbox = webix.extend({
                    getValue:function(){},
		            setValue:function(){},
		            getHelper:function(node, config){
		            	return {
		            		check:function(){ config.checked = false; node.onclick(); },
		            		uncheck:function(){ config.checked = true; node.onclick(); },
		            		isChecked:function(){ return config.checked; },
                            getNode:function(){ return node },
                            setOnClickListener:function(clickListener){ config.clickListener = clickListener; }
                        };
		            },
		            refresh:function(master, node, config){
		            	node.onclick = function(){
		            		this.getElementsByTagName("input")[0].checked = config.checked = !config.checked;
		            		var column = master.getColumnConfig(config.columnId);
                            var checked = config.checked ? column.checkValue : column.uncheckValue;
                            var counter = 0;
                            var ignore = true;
		            		master.data.each(function(obj){
		            			if(obj){ //dyn loading
		            				obj[config.columnId] = checked;
                                    //master.callEvent("onCheck", [obj.id, config.columnId, checked, ignore]);
                                    counter++;
                                    // Prevent multiple calls to wsProxy.save()
		            				//this.callEvent("onStoreUpdated", [obj.id, obj, "save"]);
		            			}
                            });
                            if (counter === 0) {
                                this.getElementsByTagName("input")[0].checked = 0;
                            }
                            master.refresh();
                            // Call the click listener with the value and the counter
                            if (config.clickListener) {
                                config.clickListener(checked, counter);
                            }
		            	};
		            },
		            render:function(master, config){ 
		            	return "<input type='checkbox' "+(config.checked?"checked='1'":"")+">"; 
		            }
                }, webix.ui.datafilter.masterCheckbox);

                // Define a proxy template for data collections updates
                webix.proxy.wsProxy = {
                    $proxy: true,
                    load: function (view, callback, details) {
//                        console.log("wsProxy: ", "view:", view, "callback:", callback, "details:", details);
                        // your loading pattern logic
                        //webix.ajax(this.source, callback, view);
                        let pager = view.getPager();
                        let start = 0;
                        let end = 50;
                        if (details) {
                            start = details.start;
                            end = start + details.count;
                        }
                        console.log('wsProxy Load: ', 'View', view, 'Datatable: ', view.config.id, 'Callback: ', callback);
                        if (details) {
                            console.log('Details:', details, 'start', details.start, 'count', details.count, 'sort', details.sort, 'filter', details.filter);
                        } else {
                            console.log('No details available');
                        }
                        if (!details) {
                            details = {};
                        }
                        if (!details.filter) {
                            details.filter = {};
                        }
                        // The time-zone offset is the difference, in minutes, between UTC and local time
                        details.filter.timezone_offset = new Date().getTimezoneOffset();
                        if (view.config.nkFilters) {
                            var filter;
                            for (f in view.config.nkFilters) {
                                filter = view.config.nkFilters[f];
                                if ($$(filter)) {
                                    console.log('Extra filter found!: ', filter, 'value', $$(filter).getValue());
                                    details.filter[filter] = $$(filter).getValue();
                                } else {
                                    console.log('Extra filter not found!');
                                }
                            }
                        } else {
                            console.log('No extra filters defined');
                        }

                        console.log('Load... start: ' + start + ', end: ' + end, 'Details: ', details);

                        var query = {
            				element_id: view.config.id,
                            //element_id: "domain_detail_chat_messages_table",
                            start: start,
                            end: end,
            			};
                        if (details) {
                            if (details.filter) {
                                query.filter = details.filter;
                            }
                            if (details.sort) {
                                query.sort = details.sort;
                            }
                        }
                        console.log('Load query:', query);
                        var masterCheckbox = view.getHeaderContent('checkbox');
                        var checkboxState = null;
                        if (masterCheckbox) {
                            checkboxState = masterCheckbox.isChecked()? "1": "0";
                        }
                        ncClient.sendMessageAsync("objects/admin.session/get_data", query)
                        .then(function(response) {
                            console.log("Loaded!", "total_count", response.data.total_count, "data", response.data.data, "requested", end-start, "got", response.data.data.length);
                            var length = response.data.data.length;
                            if (checkboxState) {
                                for (var i = 0; i < length; i++) {
                                    if (checkboxState === "1") {
                                        // Override the checkbox state with masterCheckbox
                                        // TODO: Remove this after the server takes into account the state of the master checkbox
                                        response.data.data[i].checkbox = checkboxState;
                                    } else {
                                        // Try to reuse a previously saved state
                                        response.data.data[i].checkbox = view.nkIsSelectedItem(response.data.data[i].id) ? "1" : "0";
                                    }
                                }
                                if (checkboxState === "1") {
                                    // Update the selection counter
                                    view.nkSelectAll(response.data.total_count);
                                }
                            }
                            if (pager) {
                                // If there is a pager, refresh its contents when there are new data available (or when there is none!)
                                pager.config.count = response.data.total_count;
                                pager.render();
                            }
            				webix.ajax.$callback(view, callback, "", {
                                total_count: response.data.total_count, // used to get the total number of pages
                                pos: response.data.total_count === 0? null : response.data.pos,
                                data: response.data.data
                            }, -1);
                        }).catch(function(response) {
                            console.log("ERROR at load: ", response);
                            //total.define("counter", 0);
                            //total.refresh();
                            webix.ajax.$callback(view, callback, "", {
                                total_count: 0, // used to get the total number of pages
                                pos: start,
                                data: []
                            }, -1);
                        });
                    },
                    save: function (view, update, dp, callback) {
                        //your saving pattern for single records ... 
                        //webix.ajax().post(url, update, callback);
                        var action = null;
                        var value = {};
                        console.log('Default save', 'view', view, 'update', update, 'dp', dp, 'callback', callback);
                        if (update.operation === 'update') {
                            console.log('Updating ', update.id, ' in datatable ', view.config.id, ' values: ', update.data);
                            action = "updated";
                            value.obj_id = update.id;
                            value.value = update.data;
                        } else if (update.operation === 'delete') {
                            console.log('Deleting ', update.id, ' in datatable ', view.config.id, ' values: ', update.data);
                            action = "deleted";
                            value.obj_id = update.id;
                        } else {
                            console.log('Unrecognized operation: ', update.operation);
                            alert('Unrecognized action on wsProxy:save()');
                        }
                        if (action !== null) {
                            ncClient.sendMessageAsync("objects/admin.session/element_action", {
                                element_id: view.config.id,
                                action: action,
                                value: value
                            }).then(function(response) {
                                console.log("Action " + action + " OK: ", response);
                                // Confirm the action
                                webix.ajax.$callback(dp, callback, "", update);
                                if (response.data && response.data.elements) {
                                    updateView(response.data.elements);
                                }
                            }).catch(function(response) {
                                console.log("Error at action " + action + ": ", response);
                                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
                                switch(action) {
                                    case "deleted":
                                        var grid = $$(view.config.id);
                                        if (grid) {
                                            // We add the deleted row in its old position
                                            var pos = update.data.pos;
                                            if (pos > 0) {
                                                pos--;
                                            }
                                            grid.add(update.data, pos);
                                            webix.ajax.$callback(dp, callback, "", "", null, true);
                                        }
                                        break;
                                    case "updated":
                                        var grid = $$(view.config.id);
                                        if (grid) {
                                            // We clear the grid data and trigger a refresh using the same loading URL
                                            grid.clearAll();
                                            // view.config.save has the same URL as load ("wsProxy->")
                                            grid.load(view.config.save);
                                            webix.ajax.$callback(dp, callback, "", "", null, true);
                                        }
                                        break;
                                    default:
                                        // Unknown action performed
                                        webix.ajax.$callback(dp, callback, "", "", null, true);
                                }
                            });
                        } else {
                            webix.ajax.$callback(dp, callback, "", "", null, true);
                        }
                    },
                    // This result function it's not needed (by commenting it, we managed to send multiple updates for the same row)
                    result: function (state, view, dp, text, data, loader) {
                        //your logic of server-side response processing ... 
                        console.log('Default result', 'state', state, 'view', view, 'dp', dp, 'text', text, 'data', data, 'loader', loader);
                        //dp.processResult(state, data, details);
                        dp.processResult(state, data);
                    }
                    //other custom properties and methods
                    //prop1:value1,
                    //method1:function(){ ...
                };
                updateView(data.elements);
    /*            
                $$("sidebar").unselectAll();
                $$("sidebar").closeAll();

                setPath(data.detail.obj, data.detail.obj);
    */            
            }, this);

            document.addEventListener("core.event.domain.admin.session.update_elements", function(response) {
                console.log("core.event.domain.admin.session.update_elements", response);
                var items = response.detail[1].elements;
                updateView(items);
            }, this);

            document.addEventListener("core.event.domain.admin.session.unloaded", function(response) {
                console.log("core.event.domain.admin.session.unloaded", response);
                if (adminSessionId === response.detail[0]
                    && response.detail[1].code === "user_stop") {
                    // This admin.session has been unloaded, so there is no need to send any more messages
                    webix.message({
                        "type": "error",
                        "text": "Admin session stopped because: " + response.detail[1].reason
                    });
                    doLogout();
                }
            })

            window.onpopstate = function(event) {
                console.log("onpopstate -> ", window.location.hash);
                // currentURL starts with "#" just like window.location.hash
                if (currentHash !== window.location.hash) {
                    // Send this new URL (hash) to the server
                    console.log("Sending URL hash to the server: ", window.location.hash);
                    sendURL();
                }
/*
                console.log("onpopstate -> " + location.pathname);
                if (event.state) {
                    console.log("Restore currentDomainId: ", event.state.currentDomainId,
                                ", and currentBreadcrumbs: ", event.state.currentBreadcrumbs,
                                ", and currentDetailId: ", event.state.currentDetailId);
                    currentDomainId = (event.state.currentDomainId !== undefined)? event.state.currentDomainId : null;
                    currentBreadcrumbs = (event.state.currentBreadcrumbs !== undefined)? event.state.currentBreadcrumbs : {};
                    currentDetailId = (event.state.currentDetailId !== undefined)? event.state.currentDetailId : null;
                    // TODO: Handle this event and send the proper action to the server
                    updateBreadcrumbs(currentBreadcrumbs);
                } else {
                    // There isn't any saved state
                    currentDomainId = null;
                    currentBreadcrumbs = null;
                    currentDetailId = null;
                }
                unselectAll();
*/
            };
/*
                // Old on popstate:
                clearBody();
                showProgress();
                if (event.state && event.state.path && event.state.pathIds) {
                    setPath(event.state.path, event.state.pathIds);
                    // close tree elements and open the pathids
                    let tree = $$("sidebar");
                    let pos;
                    let found;
                    let ids = event.state.pathIds.split("/");
                    pos = ids.length-1;
                    found = false;
                    while (pos >= 0 && !found) {
                        found = ids[pos] !== "" && tree.getItem(ids[pos]);
                        pos--;
                    }
                    if (found) {
                        pos++;
                        console.log("Found: " + ids[pos])
                        selectTreeElement(ids[pos]);
                    } else {
                        selectTreeElement(null);
                    }
                } else {
                    setPath("/", "/");
                    selectTreeElement(null);
                }
                ncClient.switchObject(location.pathname, {
    			    'success': function(response) {
                        console.log('************************ SWITCH OBJECT SUCCESS');
                        //setPath(currentPath + '/new', currentPathIds + '//');
                        parseJSONFunctions(response.content);
                        replaceBody(response.content);
                        hideProgress();
    			    },
    			    'error': function(response) {
                        hideProgress();
                        webix.message({ 'type': 'error', 'text': response.code + ' - ' + response.error });
    			    }
    		    });
            };
*/
            connect();
        }

        function connect() {
            console.log("Connect: ", host, port, path, useWss);
    		ncClient.connect(host, port, path, useWss);

            /*
            // Simulate a websocket close event
            window.setTimeout(() => {
                console.log("Closing websocket...");
                ncClient.webSocket.close();
            }, 5000)
            */
    	}

        function doLogin(user, password, domain) {
            if (!ncClient.isConnected()) {
                if (window.localStorage) {
                    localStorage.setItem(lsNcLogin, user);
                    localStorage.setItem(lsNcPwd, password);
                }
                connect();
            } else {
                adminSessionId = null;
                ncClient.sendMessageAsync("objects/user/login", {
                    id: user,
                    password: password,
                    domain: domain
                }).then(function(response) {
                    console.log("Success on login", response);
                    dispatchEvent("loginSuccessEvent", response);                    
                    return ncClient.sendMessageAsync("objects/admin.session/find", {});
                }).then(function(response) {
                    console.log("Found an admin.session", response);
                    return ncClient.sendMessageAsync("objects/admin.session/start", {
                        id: response.data.sessions[0].obj_id,
                        language: "en",
                        url: window.location.hash
                    });
                }).catch(function(response) {
                    if (response.data.code === "session_not_found") {
                        console.log("Error at find", response);
                        // Error at find
                        return ncClient.sendMessageAsync("objects/admin.session/create", {
                            language: "en",
                            url: window.location.hash
                        });
                    } else {
                        // This error response will reach the next "catch"
                        throw(response);
                    }
                }).then(function(response) {
                    console.log("Admin session started!!", response);
                    dispatchEvent("sessionStartedEvent", response);
                }).catch(function(response) {
                    console.log("Admin session NOT started!!!", response);
                    dispatchEvent("loginErrorEvent", response);
                });
            }
        }

        function submitLogin() {
    		if ($$("login-form").validate()) {
                this.getTopParentView().hide(); //hide window
                ncLogin = $$("login-form").getValues().login;
                ncPass = $$("login-form").getValues().password;

                doLogin(ncLogin, ncPass, defaultDomain);
            } else {
    			webix.message({ "type": "error", "text": "Form data is invalid" });
    		}
    	}

        function doLogout() {
            loggedOut = true;
    		ncClient.close();
    	}

        function doDestroy() {
            ncClient.sendMessageAsync("objects/admin.session/stop", {
                id: adminSessionId,
                reason: "logout"
            }).then(function(response) {
                console.log("************************ DESTROY SUCCESS");
                doLogout();
            }).catch(function(response) {
                console.log("Error at doDestroy", response);
                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
                doLogout();
            });
    	}

        /**
         * 'elements' is an array of different classes of UI elements that has been updated:
         * - frame: Toolbar that contains the actual domain, user and a user menu with available actions
         * - tree: Sidebar data that will be displayed as multiple trees, ordered from top to bottom
         * - breadcrumbs: Actual path for an easy navigation between pages
         * - url: URL that will be displayed on the navigation bar
         * - detail: Body of the elemen/s that is/are displayed right now
         */
        function updateView(elements) {
            var elem = null;
            var length = (elements["length"])? elements.length : 0;
            var json = null;
            
            console.log("updateView: ", elements);
            for (var i = 0; i < length; i++) {
                elem = elements[i];
                switch(elem.class) {
                    case "frame":
                        updateFrame(elem);
                        break;
                    case "tree":
                        updateWholeTree(elem);
                        break;
                    case "breadcrumbs":
                        updateBreadcrumbs(elem);
                        break;
                    case "url":
                        updateURL(elem);
                        break;
                    case "detail":
                        updateDetail(elem);
                        break;
                    default:
                        console.log("Default: ", elem.class);
                        console.log("Updating element: ", elem);
                        console.log("ID READ: ", elem.id, $$(elem.id));
                        if (elem.id.startsWith(DOMAIN_TREE)) {
                            // It is an element from the sidebar menu
                            console.log("It is an element from the sidebar menu");
                            var tree;
                            var treeId;
                            // In which tree it is stored?
                            // Let's get its ID from the element ID
                            //>                        <
                            // domain_tree_"tree_group"_"element"_...
                            treeId = elem.id.split(SEPARATOR, 3).join(SEPARATOR);
                            console.log("Tree Id: ", treeId);
                            console.log("Tree: ", $$(treeId));
                            // It is one the trees? or an element from one of them?
                            if (treeId !== elem.id) {
                                // It is an element from one of the trees
                                console.log("It is an element from one of the trees");
                                // Get the tree component
                                tree = $$(treeId);
                                console.log("Got tree: ", tree);
                                // Update
                                json = createTreeElement(elem);
                                console.log("Updating: ", elem.id, " with: ", json);
                                treeRecursiveUpdate(tree, json);
                            } else {
                                // It is one of the trees
                                console.log("It is one of the trees");
                                console.log("Container: ", $$(elem.id+"container"));
                                json = createTreeGroup(elem);
                                console.log("New group: ", json);
                                replaceComponent(elem.id+"container", json);
                            }
                        } else if (elem.id.startsWith(ADMIN_FRAME)) {
                            // It is an element from the frame
                            console.log("It is an element from the frame");
                            updateFrameState([elem]);
                            console.log("New frame state: ", frameState);
                            replaceComponent(ADMIN_FRAME, createFrame(frameState));
                        } else {
                            // It is a standalone element
                            var elem2 = elem;
                            while (elem2 !== undefined && elem2["class"] && elem2.class === "webix_ui" && elem2["value"]) {
                                elem2 = elem2.value;
                            }
                            console.log("Replacing", elem.id, elem2.id);
                            if (elem2) {
                                console.log("Before replace: elem1ID:", elem.id, "elem2ID:", elem2.id, "OBJ1: ", $$(elem.id), "OBJ2:", $$(elem2.id));
                                // Force the same ID as the parent JSON
//                                elem2["id"] = elem.id;
                                // Eval possible functions
                                parseJSONFunctions(elem2);
                                // And replace that component
                                replaceComponent(elem2.id, elem2);
                                console.log("Replaced OK", elem, elem2);
                                console.log("After replace: elem1ID:", elem.id, "elem2ID:", elem2.id, "OBJ1: ", $$(elem.id), "OBJ2:", $$(elem2.id));
                                if (!$$(elem2.id)) {
                                    console.log("Replace failed somehow: ", elem.id, elem, elem2.id, elem2);
                                }
                            } else {
                                console.log("ERROR: while replacing standalone element", elem, elem2);
                            }
                        }
                }
            }
        }

        function treeRecursiveUpdate(tree, item) {
            var state = tree.getState();
            var parent_id = tree.exists(item.id)? tree.getParentId(item.id) : undefined;
            if (tree.isBranch(item.id) && !tree.isBranchOpen(item.id)) {
                item.style = 'font-weight: bolder';
            }
            treeRecursiveUpdate2(tree, item, parent_id, 0);
            tree.setState(state);
        }

        function treeRecursiveUpdate2(tree, item, parent_id, counter) {
            // Iterate through the items (if it has childs), and add all elements...
            var id = item.id;
            var index = tree.getIndexById(id);
            if (index === -1) {
                // Item not found
                console.log("treeRecursiveUpdate: item not found, adding at: ", counter, "below: ", parent_id);
                tree.add(item, counter, parent_id);
            } else {
                console.log("treeRecursiveUpdate: item found, replacing at: ", index, " below: ", parent_id);
                tree.remove(id);
                tree.add(item, index, parent_id);
            }
            var length = (item.data)? item.data.length : 0;
            for (var i = 0; i < length; i++) {
                treeRecursiveUpdate2(tree, item.data[i], id, i);
            }
        }

        function updateFrame(frame) {
            var frameContent = {};
            var items;
            var length;

            console.log("updateFrame: ", frame);
            if (frame !== "undefined") {
                updateFrameState(frame.value.items);
                replaceComponent(ADMIN_FRAME, createFrame(frameState));
            }
            console.log("Frame updated!", frameState);
        }

        function updateFrameState(frameItems) {
            var length = (frameItems.length)? frameItems.length : 0;

            console.log("Updating frame state", frameItems);
            for (var i = 0; i < length; i++) {
                if (frameItems[i].id === ADMIN_FRAME_DOMAIN_NAME
                    || frameItems[i].id === ADMIN_FRAME_DOMAIN_ICON
                    || frameItems[i].id === ADMIN_FRAME_USER_NAME
                    || frameItems[i].id === ADMIN_FRAME_USER_ICON
                    || frameItems[i].id === ADMIN_FRAME_USER_MENU) {
                    frameState[frameItems[i].id] = frameItems[i];
                } else {
                    console.log("Frame parameter not recognized: ", frameItems[i]);
                }
            }
            console.log("Frame state updated: ", frameState);
        }

        function updateWholeTree(tree) {
            var groups = [];
            var items;
            var length;
            var data;
            var json;

            console.log("updateWholeTree: ", tree);
            // For every tree group, create an independent tree
            if (tree !== "undefined") {
                items = tree.value.items;
                length = (items.length)? items.length : 0;
                treeIds = [];
                for (var i = 0; i < length; i++) {
                    groups.push(createTreeGroup(items[i]));
                    treeIds.push(items[i].id);
                }
            }

            // Create sidebar using the data read
            json = createSidebar(groups);
            console.log("Tree webix: ", JSON.stringify(json));
            replaceComponent("sidebar", json);
            console.log("Tree updated!", json, groups);
        }

/* Tree data example:
    [
        {
            "id": "UUID_1", "open": true, "value": "Domains", "icon": "briefcase", "pathName": "domains", "data": [
                { "id": "UUID_1.1", "value": "DKV", "pathName": "dkv" },
                { "id": "UUID_1.2", "value": "SIPSTORM", "pathName": "sipstorm" }
            ]
        },
        {
            "id": "UUID_2", "open": true, "value": "Groups", "icon": "users", "pathName": "groups", "data": [
                { "id": "UUID_2.1", "value": "Admin", "pathName": "admin" },
                { "id": "UUID_2.2", "value": "Testers", "pathName": "testers" },
                { "id": "UUID_2.3", "value": "Support", "pathName": "support" },
                { "id": "UUID_2.4", "value": "Customers", "pathName": "customers" }
            ]
        },
        ...
    ]
*/

        function createSidebar(groups) {
            return {
                "view": "scrollview",
                "id": "sidebar",
                "type": "clean",
                "css": "sidebar",
                "width": 250,
                "scroll": "y",
                "body": {
                    "rows": groups
                }
            };
        }

        function createTreeGroup(group) {
            var data = [];
            var items;
            var length;
            var numElems = 0;

            items = group.value.items;
            length = (items.length)? items.length : 0;
            for (var i = 0; i < length; i++) {
                data.push(createTreeElement(items[i]));
                numElems += data[i].size;
            }
            console.log(group.id, numElems);
            return {
                "id": group.id+"container",
                "css": "menu_container",
                sizeToContent:true,
                "rows": [
                    {
                        "type": "header",
                        "template": group.value.label
                    }, {
                        "id": group.id,
                        "view": "tree",
                        "height": (numElems * 40) + "px",
                        "type": "menuTree2",
                        "css": "menu",
                        "template": "{common.icon()}<span class='webix_tree_item_span' style='#style#'>#value#</span>#badge#",
                        "activeTitle": true, // Sets if the tree should open/close a branch when clicked
                        "select": true,
                        "type": {
                            "icon": function(obj, common) {
                                console.log('TYPE ICON:', obj, common);
                                var template = "";
                                var icon = obj.icon? obj.icon : "";
                                var rotate = obj.rotate? obj.rotate : "";
                                if (obj.$count) {
                                    if (obj.open) {
                                        template += "<div class='webix_icon fa-angle-down'></div>";
                                    } else {
                                        template += "<div class='webix_icon fa-angle-right'></div>";
                                    }
                                } else {
                                    template += "<div class='webix_tree_none'></div>";
                                }
                                if (icon.startsWith("fa-")) {
                                    template += "<i class='webix_icon fa " + icon + " " + rotate + "' aria-hidden='true'></i>";
                                } else if (icon.startsWith("file-")) {
                                    template += "<img class='file_icon' src=" + getFileSrc(icon) + " />"
                                } else if (icon.startsWith("img/")) {
                                    template += "<img class='img_icon' src=" + icon + " />"
                                }
                                console.log('Icon template: ', template);
                                return template;
                            }
                        },
                        "tooltip": {
						    "template": function(obj) {
							    return obj.tooltip !== ""? obj.tooltip : "";
						    }
                        },
                        "data": data,
                        "on": {
                            "onItemClick": function(id) {
                                menuItemClick(id, group.id);
                            }
                        }
                    }
                ]
            };
        }

        function createTreeElement(element) {
            var json = {};
            switch (element.class) {
                case "menuEntry":
                    json = {
                        "id": element.id,
                        "type": "icon",
                        "open": true,
                        "value": createCounterLabel(element),
                        "tooltip": element.value.tooltip !== undefined? element.value.tooltip : "",
                        "badge": createBadgeSpan(element),
                        "icon": element.value.icon === undefined? "" : element.value.icon,
                        "size": 1
                    };
                    break;
                case "menuGroup":
                    var items = element.value.items;
                    var data = [];
                    var length = (items.length)? items.length : 0;
                    for (var i = 0; i < length; i++) {
                        data.push(createTreeElement(items[i]));
                    }
                    json = {
                        "id": element.id,
                        "open": false,
                        "value": createCounterLabel(element),
                        "tooltip": element.value.tooltip !== undefined? element.value.tooltip : "",
                        "badge": createBadgeSpan(element),
                        "icon": element.value.icon === undefined? "" : element.value.icon,
                        "data": data,
                        "size": length+1
                    };
                    break;
                default:
                    console.log("createTreeElement: Unrecognized group element class: ", items[i]);
            }

            return json;
        }

        function updateBreadcrumbs(path) {
            var newPath;
            console.log("updateBreadcrumbs: ", path);
            if (path !== undefined) {
                currentBreadcrumbs = path;
//                replaceState(window.location.pathname);
                newPath = createBreadcrumbs(path);
                replaceComponent("toolbar-path", newPath);
                console.log("Breadcrumbs updated!", newPath);
            }
        }

        function updateURL(elem) {
            console.log("updateURL: ", elem);
            if (elem !== undefined) {
                currentURLId = elem.id;
                setURL(elem.value.label);
            }
        }

        function updateDetail(elem) {
            console.log("updateDetail: ", elem);
            if (elem && elem.value && elem.value.class === 'webix_ui' && elem.value.value) {
                parseJSONFunctions(elem.value.value);
                replaceBody(elem.value.value);
                console.log("Detail updated!", elem.value.value);
            } else if (elem && elem.value && isEmpty(elem.value)) {
                console.log("Clear body");
                clearBody();
                console.log("Clear tree selection");
                // unselect all elements from all trees
                unselectAll();
            } else if (elem && elem.value) {
                console.log("Error: unknown detail format");
            }
        }

        function createCounterLabel(element) {
            if (element.value.counter && element.value.counter > 0) {
                return element.value.label + " (" + element.value.counter + ")";
            }
            return element.value.label;
        }

        function createBadgeSpan(element) {
            if (element.value.badge && element.value.badge > 0) {
                return "&nbsp;<span class='webix_badge' style='position: relative'>"+element.value.badge+"</span>";
            }
            return "";
        }

        function addBadgeSpan(element, value) {
            element.badge = "&nbsp;<span class='webix_badge' style='position: relative'>"+value+"</span>";
        }

        function clearBadge(element) {
            element.badge = "";
        }

        function clearStyle(element) {
            element.style = "";
        }

/* Detail function parsing example:
            if (detail !== "undefined") {
                //replaceBody(detail);
                // eval all passed string functions values
                parseJSONFunctions(detail.content);
                replaceBody(detail.content);
            }
*/

        function replaceComponent(componentId, newJson) {
            let component = $$(componentId);

            if (component) {
                webix.ui(newJson, component);
            } else {
                console.log("ERROR in replaceComponent: component ID " + componentId + " not found");
            }
        }

        function replaceComponentWithParent(componentId, parentId, newJson) {
            let component = $$(componentId);
            let parent = $$(parentId);
            if (component && parent) {
                webix.ui(newJson, parent, component);
            } else {
                console.log("ERROR in replaceComponent: component ID " + componentId + " or parent ID " + parentId + " not found");
            }
        }

        function menuItemClick(menuId, treeId) {
/*
            clearBody();
            let paths = recreatePathFromTreeElem(menuId, "sidebar");
            setPath(paths.path, paths.idPath);
            showProgress();
            ncClient.switchObject(paths.path, {
    			"success": function(response) {
                    console.log("************************ SWITCH OBJECT SUCCESS");
                    parseJSONFunctions(response.content);
                    replaceBody(response.content);
                    hideProgress();
                    /*
                    // Simulate a long load time
                    window.setTimeout(() => {
                        parseJSONFunctions(response.content);
                        replaceBody(response.content);
                        hideProgress();
                    }, 1000)
                    */
/*    			},
    			"error": function(response) {
                    hideProgress();
                    webix.message({ "type": "error", "text": response.code + " - " + response.error });
    			}
    		});
*/
            console.log('Clicked ' + menuId + " on " + treeId);
            // clear badge
            var tree = $$(treeId);
            var item = tree.getItem(menuId);
            clearStyle(item);
            clearBadge(item);
            tree.updateItem(menuId, item);
            // unselect all elements from all trees
            unselectAll();
            // send selected event to the server
            ncClient.sendMessageAsync("objects/admin.session/element_action", {
                element_id: menuId,
                action: "selected"
            }).then(function(response) {
                console.log("ID clicked OK: ", response);
                if (response.data && response.data.elements) {
                    updateView(response.data.elements);
                }
            }).catch(function(response) {
                console.log("Error at menuItemClick: ", response);
                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
            });
        }

        function unselectAll() {
            var tree;
            for (var i = 0; i < treeIds.length; i++) {
                tree = $$(treeIds[i]);
                if (tree) {
                    tree.unselectAll();
                }
            }
        }

        function closeAll() {
            var tree;
            for (var i = 0; i < treeIds.length; i++) {
                tree = $$(treeIds[i]);
                if (tree) {
                    tree.closeAll();
                }
            }
        }

        function homeLabelClick(id) {
            unselectAll();
            closeAll();
            console.log("homeLabelClick: ", id);
            ncClient.sendMessageAsync("objects/admin.session/element_action", {
                element_id: id,
                action: "selected"
            }).then(function(response) {
                console.log("ID clicked OK: ", response);
                if (response.data && response.data.elements) {
                    updateView(response.data.elements);
                }
            }).catch(function(response) {
                console.log("Error at homeLabelClick: ", response);
                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
            });

            /*
            setPath("/", "/");
            replaceBody(createHomeBody());
            clearBody();
            setPath("/", "/");
            showProgress();
            ncClient.switchDomain("/", {
    			"success": function(response) {
                    console.log("************************ SWITCH DOMAIN SUCCESS");
                    updateView(response.frame, response.tree, response.detail);
                    hideProgress();
    			},
    			"error": function(response) {
                    hideProgress();
                    webix.message({ "type": "error", "text": response.code + " - " + response.error });
    			}
    		});
            */
        }

        function breadcrumbsClicked(id, pathElem) {
            // TODO: Send this event to the server
            console.log('Breadcrumbs clicked: ' + pathElem);
            
            ncClient.sendMessageAsync("objects/admin.session/element_action", {
                element_id: id,
                action: "selected",
                value: pathElem
            }).then(function(response) {
                console.log("Breadcrumbs clicked OK: ", response);
                if (response.data && response.data.elements) {
                    // Update view
                    updateView(response.data.elements);
                }
            }).catch(function(response) {
                console.log("Error at breadcrumbsClicked: ", response);
                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
            });
        }

/*
        function pathClicked(path, nodeId) {
            clearBody();
            let tree = $$("sidebar");
            let parentId;

            tree.unselectAll();
            tree.closeAll();
            if (path && nodeId) {
                if (path !== "/") {
                    if (tree.isBranch(nodeId)) {
                        tree.open(nodeId, true);
                        tree.select(nodeId);
                    } else {
                        parentId = tree.getParentId(nodeId);
                        if (parentId !== 0) {
                            tree.open(parentId, true);
                        }
                        tree.select(nodeId);
                    }
                }
    /*
                let paths = recreatePathFromTreeElem(nodeId, "sidebar");
                switch(nodeId) {
                    case "UUID_3.2.1":
                        replaceBody(createUserProfileBody("user"));
                        break;
                    case "UUID_3.2.2":
                        replaceBody(createUserProfileBody("doctor"));
                        break;
                    case "UUID_3.2.3":
                        replaceBody(createUserProfileBody("patient"));
                        break;
                    default:
                        switch(paths.path) {
                            case "/":
                                // User clicked in Home path
                                replaceBody(createHomeBody());
                                break;
                            default:
                                replaceBody(createDatatableBody());
                        }
                }
                setPath(paths.path, paths.idPath);
    */
/*
                clearBody();
                let paths = recreatePathFromTreeElem(nodeId, "sidebar");
                setPath(paths.path, paths.idPath);
                showProgress();
                ncClient.switchObject(paths.path, {
    			    "success": function(response) {
                        console.log("************************ SWITCH OBJECT SUCCESS");
                        parseJSONFunctions(response.content);
                        replaceBody(response.content);
                        hideProgress();
    		    	},
    			    "error": function(response) {
                        hideProgress();
                        webix.message({ "type": "error", "text": response.code + " - " + response.error });
    			    }
    		    });
            }
        }
*/
        function createProfilePopup(user_menu) {
            var data = [];
            var items = null;
            var length;
            var element = {};
            if (user_menu !== undefined) {
                items = user_menu.value.items;
                length = (items.length)? items.length : 0;
                for (var i = 0; i < length; i++) {
                    if (items[i].class === "menuEntry") {
                        element = {
                            "id": items[i].id,
                            "icon": items[i].value.icon,
                            "value": createCounterLabel(items[i]),
                            "tooltip": items[i].value.tooltip !== undefined? items[i].value.tooltip : "",
                            "badge": createBadgeSpan(items[i])
                        }
                    } else if (items[i].class === "frameUserMenuSeparator") {
                        element = { "$template": "Separator" };
                    } else {
                        console.log("User menu parameter not recognized: ", items[i]);
                    }
                    data.push(element);
                }
            }
            /* Data examples:
    		{"id": 1, "icon": "user", "value": "My Profile"},
    		{"id": 2, "icon": "cog", "value": "My Account"},
    		{"id": 3, "icon": "calendar", "value": "My Calendar"},
    		{"id": 5, "icon": "tasks", "value": "My Tasks"},
    		{ "$template": "Separator" },
            */
            console.log("User menu data: ", data);
            return {
                "view": "submenu",
                "id": ADMIN_FRAME_USER_MENU,
                "width": 200,
                "padding": 0,
                "data": data,
                "type": {
                    "template": function(obj) {
                        if (obj.type)
                            return "<div class='separator'></div>";
                        return "<span class='webix_icon alerts " + obj.icon + "'></span><span>" + obj.value + "</span>" + obj.badge;
                    }
                },
                "tooltip": {
					"template": function(obj) {
						return obj.tooltip !== ""? obj.tooltip : "";
					}
                },
                "on": {
                    "onItemClick": profileItemClick
                }
            }
        }

        function createProfile(state) {
            var domain_css = "";
            var user_name = "";
            var user_tooltip = "";
            var user_badge = "";
            var user_icon = "";
            var user_img = "";
            var user_menu = {};
            var user_menu_icon = "";
            
            if (state) {
                domain_css = state[ADMIN_FRAME_DOMAIN_NAME].value.css.toLowerCase();
                user_name = createCounterLabel(state[ADMIN_FRAME_USER_NAME]);
                user_tooltip = state[ADMIN_FRAME_USER_NAME].value.tooltip !== undefined? state[ADMIN_FRAME_USER_NAME].value.tooltip : "";
                user_badge = createBadgeSpan(state[ADMIN_FRAME_USER_NAME]);
                user_icon = state[ADMIN_FRAME_USER_ICON].value.icon_id;
                user_menu = state[ADMIN_FRAME_USER_MENU];
                user_menu_icon = state[ADMIN_FRAME_USER_MENU].value.icon;
                
                webix.ui(createProfilePopup(user_menu));
            }

            if (user_icon !== "") {
                user_img = "<img class='photo' src=" + getFileSrc(user_icon) + " />";
            } else if (user_name !== "") {
                user_img = "<img class='photo' src='img/avatar.png' />";
            }

            return {
                "height": 46,
                "id": "person-template",
                "css": "background_transparent profile-container align-center " + domain_css,
                "borderless": true,
                "width": "100%",
                "gravity": 0,
                "data": { "name": user_name, "tooltip": user_tooltip },
                "template": function(obj) {
                    var html = 	"<div class='profile-layout flex' onclick='webix.$$(\""+ADMIN_FRAME_USER_MENU+"\").show(this)' title='"+obj.tooltip+"'>";
    		        html += user_img + "</span> <span class='profile-name align-center' id='user_logged_name'>"+obj.name+"</span> ";
                    html += user_badge;
    		        html += "<span class='webix_icon fa-angle-down align-center'></span></div>";
    		        return html;
                }
            }
        }

        function createLoginPopup() {
            return {
            	"view": "window",
            	"id": "login-popup",
            	"minWidth": 300,
            	"modal": true,
            	"position": "center",
            	"head": "Login",
            	"body": {
            		"view": "form",
            		"id": "login-form",
            		"borderless": true,
            		"elements": [
            			{ "view": "text", "id": "userLogin", "label": "Login", "name": "login" },
            			{ "view": "text", "type": "password", "label": "Password", "name": "password" },
            			{ "view": "template", "id": "loginError", "height": 20, "borderless": true, "css": "text_danger no_padding", "template": ""},
            			{ "view": "button", "value": "Submit", "click": submitLogin}
            		],
            		"on": {
            			"onSubmit": submitLogin
            		},
            		"rules":{
            			"password": webix.rules.isNotEmpty,
            			"login": webix.rules.isNotEmpty
            		},
            		"elementsConfig": {
            			"labelPosition": "top",
            		}
            	}
            }
        }

        function recreatePathFromTreeElem(id, treeId) {
            let tree = $$(treeId);
            let elemId = id;
            let elem;
            let path = "";
            let idPath = "";

            if (id && tree) {
                elem = tree.getItem(id);
                while (elem) {
                    idPath = "/" + elemId + idPath;
                    path = "/" + elem.pathName + path;
                    elemId = tree.getParentId(elemId);
                    elem = (elemId === 0)? null : tree.getItem(elemId);
                }
            }

            if (path === "") {
                path = "/";
                idPath = "/";
            }

            return {path, idPath};
        }

        function createBreadcrumbsElement(name, path, nodeId) {
            return {"name": name, "path": path, "nodeId": nodeId};
        }

/*
        function createBreadcrumbs(path, pathIds) {
            if (!path || !pathIds) {
                return {
                    "view": "toolbar", "id": "toolbar-path", "borderless":true, "elements": []
                };
            }
            let elements = path.split("/");
            let ids = pathIds.split("/");
            let arrayElems = [ createBreadcrumbsElement("Home", "/", "root") ];
            let i;
            let incPath = "";

            for (i = 0; i < elements.length; i++) {
                if (elements[i] && elements[i] !== "") {
                    incPath += "/" + elements[i];
                    arrayElems.push(createBreadcrumbsElement(elements[i], incPath, ids[i]));
                }
            }

            return {
                "id": "toolbar-path", "template": function(obj){
                    let gathered = "<ul class='breadcrumb'>";
                    obj.children.forEach(function(obj) {
                        if (!obj.nodeId || obj.nodeId === "") {
                            gathered += "<li>" + obj.name + "</li>";
                        } else {
                            gathered += "<li onClick='pathClicked(\"" + obj.path + "\", \"" + obj.nodeId + "\")'>" + obj.name + "</li>";
                        }
                    });
                    return gathered + "</ul";
                },
                "data": {children: arrayElems},
                "autoheight": true,
                "css": "nopadding"
            }
        }
*/

        function createBreadcrumbs(path) {
            if (path === undefined) {
                return {
                    "view": "toolbar", "id": "toolbar-path", "borderless":true, "elements": []
                };
            }
            return {
                "id": "toolbar-path", "template": function(obj){
                    let gathered = "<ul class='breadcrumb'>";
                    let pathSoFar = "/";
                    obj.children.forEach(function(child) {
                        if (child !== "/") {
                            if (pathSoFar === "/") {
                                pathSoFar += child;
                            } else {
                                pathSoFar += "/" + child;
                            }
                        } else {
                            pathSoFar = child;
                        }
                        gathered += "<li onClick='logic.breadcrumbsClicked(\"" + obj.id + "\",\"" + pathSoFar + "\")'>" + child + "</li>";
                    });
                    return gathered + "</ul";
                },
                "data": {children: path.value.items, id: path.id},
                "autoheight": true,
                "css": "nopadding"
            }
        }

        function initBreadcrumbsAndBody() {
            let defaultBreadcrumbs = createBreadcrumbs();

            return {
                "id": "bodyParent",
                "type": "line",
                "borderless": true,
                "width": "100%",
                "height": "100%",
                "rows": [
                    defaultBreadcrumbs,
                    {
                        "id": "body"
                    }
                ]
            }
        }

        function replaceBody(newBody) {
            // Replace component body without specifying the parent fails
            // if this function is called several times
            // (body id is not found)
            //replaceComponent("body", newBody);
    /*
            // Option 1: remove the view from its parent and re-add it afterwards
            let bodyContainer;
            bodyContainer = $$("bodyParent");

            if (bodyContainer) {
                bodyContainer.removeView("body");
                bodyContainer.addView(newBody);
            }
    */
            // Option 2: replace the body component specifying also its parent ID
            replaceComponentWithParent("body", "bodyParent", newBody);
        }

        function showProgress() {
            $$("workspace").showProgress();
        }

        function hideProgress() {
            $$("workspace").hideProgress();
        }

        function setPath(newPath, newPathIds) {
            if (window.location.pathname !== newPath) {
                console.log("Setting new Path: " + newPath);
                history.pushState({path: newPath, pathIds: newPathIds}, "NewPath", newPath); // Creates a new state, in Firefox it asks if it should save the user/password
                //history.replaceState({}, "NewPath", newPath); // Replaces the state, this method doen't make Firefox to ask for user/password saving but there won't be back/forth navigation
                console.log("Path changed!");
            } else {
                console.log("Path not changed (same path)");
            }
            replaceComponent("toolbar-path", createBreadcrumbs(newPath, newPathIds));
            currentPath = newPath;
            currentPathIds = newPathIds;
        }

        function getPath() {
            return { "path": currentPath, "pathIds": currentPathIds };
        }

        function sendURL() {
            var url = "/";
            var hash = window.location.hash;
            if (hash && hash.length > 0) {
                url = hash.substring(1);
            }
            ncClient.sendMessageAsync("objects/admin.session/element_action", {
                element_id: currentURLId,
                action: "updated",
                value: url
            }).then(function(response) {
                console.log("URL updated: ", response);
                currentURL = url;
                currentHash = hash;
                if (response.data && response.data.elements) {
                    updateView(response.data.elements);
                }
            }).catch(function(response) {
                console.log("Error at sendURL: ", response);
                webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
            });
        }

        function setURL(newURL) {
            console.log("pathname: ", pathname, "newURL: ", newURL);
            var newHash = "#" + newURL;
            if (window.location.hash !== newHash) {
                console.log("Setting new URL: " + newURL);
                // Creates a new state, in Firefox it asks if it should save the user/password
                //pushState(newPath);
                currentURL = newURL;
                currentHash = newHash;
                window.location.hash = newURL;
                // Replaces the state, this method doen't make Firefox to ask for user/password saving but there won't be back/forth navigation
                //replaceState(newURL);
                console.log("URL changed!", window.location.hash);
            } else {
                console.log("URL not changed (same URL)");
            }
        }

        function getURL() {
            return { "url": currentURL };
        }

        function pushState(newURL) {
            history.pushState({
                currentDomainId: currentDomainId,
                currentBreadcrumbs: currentBreadcrumbs,
                currentDetailId: currentDetailId
            }, "NewURL", newURL);
        }

        function replaceState(newURL) {
            history.replaceState({
                currentDomainId: currentDomainId,
                currentBreadcrumbs: currentBreadcrumbs,
                currentDetailId: currentDetailId
            }, "NewURL", newURL);
        }

        function selectTreeElement(id) {
            let tree = $$("sidebar");
            let parentId;

            tree.unselectAll();
            tree.closeAll();
            if (tree && id) {
                tree.select(id);
                parentId = tree.getParentId(id);
                while (parentId != 0) {
                    tree.open(parentId, true);
                    parentId = tree.getParentId(parentId);
                }
            }
        }

        function clearBody() {
            replaceBody({ "id": "body" });
        }

        function clearWorkspace() {
            replaceComponent("workspace", createEmptyWorkspace());
            webix.extend($$("workspace"), webix.ProgressBar);
        }

        function createFrame(state) {
            var domain_name = "";
            var domain_css = "";
            var domain_icon = "";
            var domain_icon_img = "";

            if (state) {
                // TODO: check whether other domains start with "/"
                domain_name = state[ADMIN_FRAME_DOMAIN_NAME].value.label;
                domain_css = state[ADMIN_FRAME_DOMAIN_NAME].value.css.toLowerCase();
                domain_icon = state[ADMIN_FRAME_DOMAIN_ICON].value.icon;
            }

            if (domain_icon !== "") {
                domain_icon_img = "<img src=" + getFileSrc(domain_icon) + " width='45' height='45'>";
            }

            return {
                "view": "toolbar",
                "id": ADMIN_FRAME,
                "height": 70,
                "css": domain_css,
                "cols": [{
                    "id": ADMIN_FRAME_DOMAIN_ICON,
                    "view": "template",
                    "padding": 0,
                    "borderless": true,
                    "css": domain_css,
                    "width": 60,
                    "height": 60,
                    "template": domain_icon_img
                }, {
                    "id": ADMIN_FRAME_DOMAIN_NAME,
                    "view": "label",
                    "autowidth": true,
                    "css": domain_css + "_toolbar-title",
                    "click": homeLabelClick,
                    "label": domain_name
                },
                {},
                createProfile(state)
                ]
            }
        }

        function createEmptyWorkspace() {
            return {
                "id": "workspace",
                "disabled": true,
                "rows": [
                    createFrame(),
                    {
                        "cols": [
                            createSidebar([]),
                            initBreadcrumbsAndBody()
                        ]
                    }
                ]
            };
        }

        function createWorkspace(domain, logoSrc, path, sidebarContent, userName, disabled) {
            return {
                "id": "workspace",
                "disabled": disabled,
                "rows": [{
                    "view": "toolbar",
                    "id": ADMIN_FRAME,
                    "height": 70,
                    "cols": [{
                        "id": "toolbar-logo",
                        "view": "template",
                        "padding": 0,
                        "borderless": true,
                        "width": 60,
                        "height": 60,
                        "template": "<img src='" + logoSrc + "'>"
                    }, {
                        "id": "toolbar-domain",
                        "view": "label",
                        "autowidth": true,
                        "css": "toolbar-title",
                        "click": homeLabelClick,
                        "label": domain
                    },
                    {},
                    createProfile(userName)
                    ]
                },
                {
                    "cols": [
                        createSidebar(sidebarContent),
                        initBreadcrumbsAndBody()
                    ]
                }]
            };
        }

        function profileItemClick(profileId) {
    		switch(profileId) {
    			case "logout":
    				webix.confirm({
    					"title": "Logout",
    					"text": "Are you sure to want to logout?",
    					"ok": "Logout",
    					"cancel": "No",
    					"callback": function(response) {
    						if(response) {
    							//doLogout();
                                doDestroy();
    						}
    					}
    				});
    				break;
    			default:
                    console.log("Profile ID clicked: ", profileId);
                    ncClient.sendMessageAsync("objects/admin.session/element_action", {
                        element_id: profileId,
                        action: "selected"
                    }).then(function(response) {
                        console.log("ID clicked OK: ", response);
                        if (response.data && response.data.elements) {
                           updateView(response.data.elements);
                        }
                    }).catch(function(response) {
                        console.log("Error at profileItemClick: ", response);
                        webix.message({ "type": "error", "text": response.data.code + " - " + response.data.error });
                    });
    		}
    	}

        function parseJSONFunctions(json) {
            if (Array.isArray(json)) {
                for(let i = 0; i < json.length; i++) {
                    parseJSONFunctions(json[i]);
                }
            } else {
                let value;
                for (property in json) {
                    if (json.hasOwnProperty(property)) {
                        value = json[property];
                        if (value && typeof value === "object") {
                            parseJSONFunctions(json[property]);
                        } else if (value && typeof value === "string" && value.trim().startsWith("function")) {
                            console.log("Substituting property '" + property + "' with its evaluated javascript code: '" + value + "'");
                            json[property] = eval('(' + value + ')');
                        }
                    }
                }
            }
        }

        function dispatchEvent(event, data) {
			var args;
			if (arguments.length <= 1) {
				args = {};
			} else {
				args = {
					detail: Array.prototype.slice.call(arguments, 1)
				}
			}
			var ncEvent = new CustomEvent(event, args);
			document.dispatchEvent(ncEvent);
		}

        function getFileSrc(fileId) {
            return "'" + window.location.origin + window.location.pathname.split("/_admin")[0] + "/_file/" + fileId + "?auth=" + sessionId + "'";
        }

        function isEmpty(obj) {
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop)) {
                    return false;
                }
            }
            return true;
        }

        return {
            createLoginPopup: createLoginPopup,
            createProfile: createProfile,
            createProfilePopup: createProfilePopup,
			init: init,
            breadcrumbsClicked: breadcrumbsClicked
		}
    })();
})();