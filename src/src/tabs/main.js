import UpdateAvailable from '../components/dialogs/updateAvailableDialog';
import PasswordConfirmDialog from '../components/dialogs/passwordConfirmDialog';
import UploadFileDialog from '../components/dialogs/uploadFileDialog';
import updateHelper from '../utils/updateHelper';
export default
    Ext.define("SYNOCOMMUNITY.RRManager.Overview.Main", {
        extend: "SYNO.ux.Panel",
        helper: SYNOCOMMUNITY.RRManager.Helper,
        updateHelper: SYNOCOMMUNITY.RRManager.UpdateHelper,
        apiProvider: SYNOCOMMUNITY.RRManager.SynoApiProvider,
        formatString: function (str, ...args) {
            return str.replace(/{(\d+)}/g, function (match, number) {
                return typeof args[number] !== 'undefined' ? args[number] : match;
            });
        },

        handleFileUpload: function (jsonData, rrManagerConfig) {
            if (jsonData) {
                this.apiProvider._handleFileUpload(jsonData).then(x => {
                    this.apiProvider.runScheduledTask('ApplyRRConfig');
                    this.showMsg(this.helper.V('ui', 'rr_config_applied'));
                    this.appWin.clearStatusBusy();
                });
            }
            //TODO: implement modify rrManagerConfig
            if (rrManagerConfig) {
                this.apiProvider._handleFileUpload(rrManagerConfig).then(x => {
                    this.apiProvider.runScheduledTask('ApplyRRConfig');
                    this.showMsg(this.helper.V('ui', 'rr_config_applied'));
                    this.appWin.clearStatusBusy();
                });
            }
        },
        constructor: function (e) {
            this.installed = false;
            this.appWin = e.appWin;
            this.data = {
                myText: "test text"
            };
            this.appWin.handleFileUpload = this.handleFileUpload.bind(this);
            this.loaded = false;
            this.callParent([this.fillConfig(e)]);
            this.apiProvider.init(this.sendWebAPI.bind(this));
            this.updateHelper.init(this.apiProvider, this);
            this.mon(
                this,
                "data_ready",
                () => {
                    if (this.getActivePage)
                        this.getActivePage().fireEvent("data_ready");
                },
                this
            );
        },
        createActionsSection: function () {
            return new SYNO.ux.FieldSet({
                title: this.helper.V('ui', 'section_rr_actions'),
                items: [
                    {
                        xtype: 'syno_panel',
                        activeTab: 0,
                        plain: true,
                        items: [
                            {
                                xtype: 'syno_compositefield',
                                hideLabel: true,
                                items: [{
                                    xtype: 'syno_displayfield',
                                    value: this.helper.V('ui', 'run_update'),
                                    width: 140
                                },
                                {
                                    xtype: 'syno_button',
                                    btnStyle: 'green',
                                    text: this.helper.V('health_panel', 'btn_from_pc'),
                                    handler: this.onFromPC.bind(this)
                                },
                                {
                                    xtype: 'syno_button',
                                    btnStyle: 'blue',
                                    text: this.helper.V('health_panel', 'btn_from_ds'),
                                    handler: this.onFromDS.bind(this)
                                }]
                            },
                        ],
                        deferredRender: true
                    },
                ]
            });
        },
        fillConfig: function (e) {
            // this.uploadFileDialog = this.createUplaodFileDialog();
            this.panels = {
                healthPanel: new SYNOCOMMUNITY.RRManager.Overview.HealthPanel({
                    appWin: e.appWin,
                    owner: this,
                }),
                statusBoxsPanel: new SYNOCOMMUNITY.RRManager.Overview.StatusBoxsPanel({
                    appWin: e.appWin,
                    owner: this,
                }),
                actionsPanel: {
                    xtype: "syno_panel",
                    itemId: "rrActionsPanel",
                    cls: "iscsi-overview-statusbox iscsi-overview-statusbox-lun iscsi-overview-statusbox-healthy iscsi-overview-statusbox-click",
                    flex: 1,
                    height: 96,
                    hidden: true,
                    layout: "vbox",
                    layoutConfig: { align: "stretch" },
                    items: [this.createActionsSection()],
                },
            };
            const t = {
                itemId: "taskTabPanel",
                deferredRender: false,
                layoutOnTabChange: true,
                border: false,
                plain: true,
                activeTab: 0,
                region: "center",
                height: 500,
                layout: "vbox",
                cls: "blue-border",
                layoutConfig: { align: "stretch" },
                items: Object.values(this.panels),
                listeners: {
                    scope: this,
                    activate: this.onActivate,
                    deactivate: this.onDeactive,
                    data_ready: this.onDataReady,
                },
            };
            return Ext.apply(t, e), t;
        }, _getRrConfig: async function () {
            const rrConfigJson = localStorage.getItem('rrConfig');
            if (rrConfigJson) {
                return JSON.parse(rrConfigJson);
            }
            return await self.getConf();
        },
        __checkDownloadFolder: async function (callback) {
            var self = this;
            const rrConfig = await this._getRrConfig();
            const config = rrConfig.rr_manager_config;
            self.apiProvider.getSharesList().then(x => {
                var shareName = `/${config['SHARE_NAME']}`;
                var sharesList = x.shares;
                localStorage.setItem('sharesList', JSON.stringify(sharesList));
                var downloadsShareMetadata = sharesList.find(x => x.path.toLowerCase() == shareName.toLowerCase());
                if (!downloadsShareMetadata) {
                    var msg = this.formatString(this.helper.V('ui', 'share_notfound_msg'), config['SHARE_NAME']);
                    self.appWin.setStatusBusy({ text: this.helper.V('ui', 'checking_dependencies_loader') });
                    self.showMsg(msg);
                    return;
                }
                if (callback) callback();
            });
        },

        __checkRequiredTasks: async function () {
            var self = this;
            var tasksList = ["RunRrUpdate", "ApplyRRConfig"];
            //list of required tasks
            var requiredTasks = [
                {
                    name: "SetRootPrivsToRrManager",
                    createTaskCallback: self.createAndRunSchedulerTaskSetRootPrivilegesForRrManager.bind(this),
                    updateTaskCallback: self.updateAndRunSchedulerTaskSetRootPrivilegesForRrManager.bind(this)
                }];
            try {
                let response = await self.apiProvider.getTaskList();
                var tasks = response.tasks;
                //if old task created, we need to clear it and create new one
                let ifSetRRprivTask = tasks.find(x => x.name === "SetRootPrivsToRrManager");
                var tasksToCreate = tasksList.filter(task => !tasks.find(x => x.name === task));
                if (tasksToCreate.length > 0 || ifSetRRprivTask) {
                    async function craeteTasks() {
                        const task = requiredTasks[0];
                        if (ifSetRRprivTask) {
                            //Update existing task
                            if (task.updateTaskCallback) {
                                var data = await self.showPasswordConfirmDialog(task.name);
                                task.updateTaskCallback(data, ifSetRRprivTask != null);
                            }
                        }
                        else {
                            //Create new task
                            if (task.createTaskCallback) {
                                var data = await self.showPasswordConfirmDialog(task.name);
                                task.createTaskCallback(data, ifSetRRprivTask != null);
                            }
                        }
                        // After all tasks have been created, you might want to notify the user.
                        self.showMsg(self.helper.V('ui', 'tasks_created_msg'));
                        self.owner.clearStatusBusy();
                    }
                    self.appWin.getMsgBox().confirm(
                        "Confirmation",
                        self.formatString(
                            self.helper.formatString(self.helper.V('ui', 'required_tasks_is_missing'), tasksToCreate),
                            self.helper.V('ui', 'required_components_missing')),
                        (userResponse) => {
                            if ("yes" === userResponse) {
                                craeteTasks();
                            } else {
                                Ext.getCmp(self.id).getEl().mask(self.helper.formatString(self.helper.V('ui', 'required_components_missing_spinner_msg'), tasksNames), "x-mask-loading");
                            }
                        }, self,
                        {
                            cancel: { text: _T("common", "cancel") },
                            yes: { text: _T("common", "agree"), btnStyle: 'red' }
                        }, {
                        icon: "confirm-delete-icon"
                    }
                    );
                }
            } catch (error) {
                self.showMsg(`Error checking or creating RRM tasks: ${error}`);
                console.error(`Error checking or creating RRM tasks: ${error}`);
            }
            finally {
                self.owner.clearStatusBusy();
            }
        },
        showPasswordConfirmDialog: function (taskName) {
            return new Promise((resolve, reject) => {
                var window = new SYNOCOMMUNITY.RRManager.Overview.PasswordConfirmDialog({
                    owner: this.appWin,
                    title: `${_T("common", "enter_password_to_continue")} for task: ${taskName}.`,
                    confirmPasswordHandler: resolve
                });
                window.open();
            });
        },
        createAndRunSchedulerTaskSetRootPrivilegesForRrManager: function (data) {
            self = this;
            this.apiProvider.getPasswordConfirm(data).then(data => {
                this.apiProvider.createTask("SetRootPrivsToRrManager",
                    "/var/packages/rr-manager/target/app/install.sh",
                    data
                ).then(x => {
                    self.sendRunSchedulerTaskWebAPI(data);
                });
            });
        },
        updateAndRunSchedulerTaskSetRootPrivilegesForRrManager: function (data) {
            self = this;
            this.apiProvider.getPasswordConfirm(data).then(data => {
                this.apiProvider.updateTask("SetRootPrivsToRrManager",
                    "/var/packages/rr-manager/target/app/install.sh",
                    data
                ).then(x => {
                    self.sendRunSchedulerTaskWebAPI(data);
                });
            });
        },
        showPrompt: function (title, message, text, yesCallback) {
            var window = new SYNOCOMMUNITY.RRManager.Overview.UpdateAvailableDialog({
                owner: this.appWin,
                title: title,
                message: message,
                msg: text,
                msgItemCount: 3,
                confirmCheck: true,
                btnOKHandler: yesCallback
            });
            window.open();
        },
        onActivate: function () {
            const self = this;
            if (this.loaded) return;
            //TODO: implement localization
            self.appWin.setStatusBusy({ text: 'Loading system info...' });
            (async () => {
                // handle the error during the initialization
                try {
                    //await self.apiProvider.init(self.sendWebAPI.bind(self));


                    const [systemInfo, packages, rrCheckVersion] = await Promise.all([
                        self.apiProvider.getSytemInfo(),
                        self.apiProvider.getPackagesList(),
                        self.initialConfig.appWin.initialConfig.appInstance.taskButton.jsConfig.checkRRForUpdates
                            ? self.apiProvider.checkRRVersion() : null
                    ]);
                    self.systemInfo = systemInfo;
                    var isModernDSM = systemInfo.version_string.includes("7.2.2");
                    self.apiProvider.setIsModernDSM(isModernDSM);

                    await self.updateAllForm();

                    await self.__checkDownloadFolder(self.__checkRequiredTasks.bind(self));
                    if (systemInfo && packages) {
                        self.rrCheckVersion = rrCheckVersion;
                        //TODO: implement localization
                        self.systemInfoTxt = `Welcome to RR Manager!`; // 
                        const rrManagerPackage = packages.packages.find((packageInfo) => packageInfo.id == 'rr-manager');

                        self.panels?.healthPanel?.fireEvent(
                            "select",
                            self.panels?.healthPanel?.clickedBox
                        );
                        self.panels.statusBoxsPanel.fireEvent(
                            "select",
                            self.panels.statusBoxsPanel.clickedBox
                        );
                        var data = {
                            text: `Model: ${systemInfo?.model}`,
                            text2: `RAM: ${systemInfo?.ram} MB`,
                            text3: `DSM version: ${systemInfo?.version_string}`,
                            rrManagerVersion: `${rrManagerPackage?.version}`,
                            rrVersion: self.rrConfig.rr_version
                        };
                        Ext.apply(data, self.data);
                        if (!self.installed) {
                            //create rr tmp folder
                            self.rrManagerConfig = self.rrConfig.rr_manager_config;
                            SYNO.API.currentManager.requestAPI('SYNO.FileStation.CreateFolder', "create", "2", {
                                folder_path: `/${self.rrManagerConfig.SHARE_NAME}`,
                                name: self.rrManagerConfig.RR_TMP_DIR,
                                force_parent: false
                            });
                            self.installed = true;
                        }
                        self.panels?.healthPanel?.fireEvent("data_ready");
                        self.panels?.statusBoxsPanel?.fireEvent("data_ready", data);
                        self.loaded = true;
                    }

                    if (rrCheckVersion && self.isUpdateAvailable(rrCheckVersion)) {
                        self.showPrompt(self.helper.V('ui', 'prompt_update_available_title'),
                            self.helper.formatString(self.helper.V('ui', 'prompt_update_available_message'), rrCheckVersion.tag),
                            rrCheckVersion.notes, self.donwloadUpdate.bind(self));
                    }
                } catch (error) {
                    self.appWin.clearStatusBusy();
                    self.showMsg(`Error during RRM initialization: ${error}`);
                    return;
                }
            })();
        },
        isUpdateAvailable: function (rrCheckVersion) {
            // Tag format: 24.11.1
            if (rrCheckVersion?.status !== "update available" || rrCheckVersion?.tag == "null" || this.rrConfig.rr_version === rrCheckVersion?.tag) {
                return false;
            }

            const currentVersion = this.rrConfig.rr_version.split('.').map(Number);
            const newVersion = rrCheckVersion.tag.split('.').map(Number);

            for (let i = 0; i < Math.max(currentVersion.length, newVersion.length); i++) {
                const current = currentVersion[i] || 0;
                const newVer = newVersion[i] || 0;
                if (newVer > current) {
                    return true;
                } else if (newVer < current) {
                    return false;
                }
            }

            return false;
        },

        showMsg: function (msg) {
            this.owner.getMsgBox().alert("title", msg);
        },
        donwloadUpdate: function () {
            self = this;
            SYNO.API.currentManager.requestAPI('SYNO.DownloadStation2.Task', "create", "2", {
                type: "url",
                destination: `${self.rrManagerConfig.SHARE_NAME}/${self.rrManagerConfig.RR_TMP_DIR}`,
                create_list: true,
                url: [self.rrCheckVersion.updateAllUrl]
            });
        },
        updateAllForm: async function () {
            this.owner.setStatusBusy();
            try {
                const rrConfig = await this.getConf();
                var configName = 'rrConfig';

                this.appWin[configName] = rrConfig;
                this[configName] = rrConfig;

                localStorage.setItem(configName, JSON.stringify(rrConfig));
            } catch (e) {
                SYNO.Debug(e);
            } finally {
                this.owner.clearStatusBusy();
            }
        },

        getConf: function () {
            return this.apiProvider.callCustomScript('getConfig.cgi')
        },
        onDeactive: function () {
            this.panels?.healthPanel?.fireEvent(
                "deactivate",
                this.panels?.healthPanel?.clickedBox
            );

        },
        onDataReady: async function () {
            const e = this;
            e.loaded = true;
            e.getComponent("rrActionsPanel")?.setVisible(true);
            e.doLayout();
            // need to clean the spinner when form has been loaded
            e.appWin.clearStatusBusy();
        },
        getActivateOverviewPanel: function () {
            if (this.getActiveTab()) {
                return this.getActiveTab().overviewPanel;
            }
            return null;
        },
        onFromPC: function () {
            this.uploadFileDialog = this.createUplaodFileDialog();
            this.uploadFileDialog.open();
        },
        onFromDS: function () {
            self = this;
            if (!Ext.isDefined(this.dialog)) {
                var a = this.getFileExtsByImageType().toString().replace(/\./g, "");
                this.dialog = new SYNO.SDS.Utils.FileChooser.Chooser({
                    parent: this,
                    owner: this.appWin,
                    closeOwnerWhenNoShare: true,
                    closeOwnerNumber: 0,
                    enumRecycle: true,
                    superuser: true,
                    usage: { type: "open", multiple: true },
                    title: this.helper.T("upload_file_dialog", "choose_file_title"),
                    folderToolbar: true,
                    getFilterPattern: function () {
                        return a;
                    },
                    treeFilter: this.helper.VMMDSChooserTreeFilter,
                    listeners: {
                        scope: this,
                        choose: function (d, b, c) {
                            b.records.forEach(function (f) {
                                var e = {
                                    name: f
                                        .get("path")
                                        .substring(
                                            f.get("path").lastIndexOf("/") + 1,
                                            f.get("path").lastIndexOf(".")
                                        ),
                                    path: f.get("path"),
                                    real_path: _S("hostname") + f.get("path"),
                                    get_patch_by: "from_ds",
                                    file_size: f.get("filesize"),
                                };
                                if (!this.preCheck(e)) {
                                    return true;
                                }
                                self.updateHelper.updateFileInfoHandler(e);
                            }, this);
                            this.dialog.close();
                        },
                        close: function () {
                            delete this.dialog;
                        },
                    },
                });
            }
            this.dialog.show();
        },
        createUplaodFileDialog: function () {
            this.uploadFileDialog = new SYNOCOMMUNITY.RRManager.Overview.UploadFileDialog({
                parent: this,
                owner: this.appWin,
                helper: this.helper,
                updateHelper: this.updateHelper,
                id: "upload_file_dialog",
                title: this.helper.V("ui", "upload_file_dialog_title"),
                apiProvider: this.apiProvider
            });
            return this.uploadFileDialog;
        },
        preCheck: function (a) {
            var b = a.path.substring(a.path.lastIndexOf("."));
            if (-1 === this.getFileExtsByImageType().indexOf(b)) {
                return false;
            }
            return true;
        },
        exts: {
            zip: [".zip"],
        },
        imageType: "zip",
        getFileExtsByImageType: function () {
            return this.exts[this.imageType];
        },
    });