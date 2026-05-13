export default
    Ext.define('SYNOCOMMUNITY.RRManager.Overview.UploadFileDialog', {
        extend: 'SYNO.SDS.ModalWindow',
        constructor: function (a) {
            this.helper = a.helper;
            this.updateHelper = a.updateHelper;
            this.owner = a.owner;
            this.parent = a.parent;
            this.apiProvider = a.apiProvider;
            this.MAX_POST_FILESIZE = Ext.isWebKit
                ? -1
                : window.console && window.console.firebug
                    ? 20971521
                    : 4294963200;
            this.callParent([this.fillConfig(a)]);
        },
        fillConfig: function (a) {
            var b = {
                width: 500,
                height: 400,
                resizable: false,
                layout: 'fit',
                items: this.createUploadPannel(),
                buttons: [
                    {
                        xtype: 'syno_button',
                        text: this.helper.T('common', 'alt_cancel'),
                        scope: this,
                        handler: function () {
                            Ext.getCmp('upload_file_dialog')?.close();
                        },
                    },
                    {
                        xtype: 'syno_button',
                        text: this.helper.T('common', 'submit'),
                        btnStyle: 'blue',
                        scope: this,
                        handler: this.onClickSubmit.bind(this),
                    },
                ],
                showMsg: this.showMsg.bind(this),
                sendArray: this.sendArray.bind(this),
                showProgressIndicator: this.showProgressIndicator.bind(this),
                hideProgressIndicator: this.hideProgressIndicator.bind(this),
                owner: this.owner,
                apiProvider: this.apiProvider,
                parent: this.parent,
            };
            Ext.apply(b, a);
            return b;
        },
        onClickSubmit: function () {
            const form = this.uploadForm.getForm();
            var fileObject = form.el.dom[1].files[0];
            if (!form.isValid()) {
                this.showMsg(this.helper.V('upload_file_dialog', 'upload_update_file_form_validation_invalid_msg'));
                return;
            }
            this.showProgressIndicator();
            this.onUploadFile(fileObject);
            Ext.getCmp('upload_file_dialog')?.close();
        },
        showProgressIndicator: function () {
            this.owner?.setStatusBusy();
        },
        hideProgressIndicator: function () {
            if (this.owner) {
                this.owner.clearStatusBusy();
            }
            else if (this.parent?.appWin) {
                this.parent.appWin.clearStatusBusy();
            }
            else {
                this.helper.unmask(this.parent);
                this.parent.owner.appWin.clearStatusBusy();
            }
        },
        showMsg: function (msg) {
            let parent = this.owner ?? this.parent?.appWin;
            parent.getMsgBox().alert('', msg);
        },
        createUploadPannel: function () {
            this.uploadForm = new Ext.form.FormPanel({
                title: this.helper.V('upload_file_dialog', 'lb_select_update_file'),
                fileUpload: true,
                name: 'upload_form',
                border: !1,
                bodyPadding: 10,
                items: [{
                    xtype: 'syno_filebutton',
                    text: this.helper.V('upload_file_dialog', 'select_file'),
                    name: 'filename',
                    allowBlank: false,
                }],
            });
            return this.uploadForm;
        },
        opts: {
            chunkmode: false,
            filefiledname: 'file',
            file: function (file) {
                var createFileObject = function (file, params, id, dtItem) {
                    var modifiedParams = SYNO.SDS.copy(params || {});
                    var lastModifiedTime = SYNO.webfm.utils.getLastModifiedTime(file);

                    if (lastModifiedTime) {
                        modifiedParams = Ext.apply(modifiedParams, {
                            mtime: lastModifiedTime
                        });
                    }

                    return {
                        id: id,
                        file: file,
                        dtItem: dtItem,
                        name: file.name || file.fileName,
                        size: file.size || file.fileSize,
                        progress: 0,
                        status: 'NOT_STARTED',
                        params: modifiedParams,
                        chunkmode: false
                    };
                };

                var lastModifiedTime = SYNO.webfm.utils.getLastModifiedTime(file);
                var fileObject = new createFileObject(file, { mtime: lastModifiedTime });
                return fileObject;
            },
            params: {
                path: '',
                overwrite: true
            }
        },
        onUploadFile: function (file) {
            let rrConfigJson = localStorage.getItem('rrConfig');
            let rrConfig = JSON.parse(rrConfigJson);
            let rrManagerConfig = rrConfig.rr_manager_config;
            this.opts.params.path = `/${rrManagerConfig.SHARE_NAME}/${rrManagerConfig.RR_TMP_DIR}`;
            let isChunkMode = false;
            if (-1 !== this.MAX_POST_FILESIZE && file.size > this.MAX_POST_FILESIZE && isChunkMode)
                {this.onError({
                    errno: {
                        section: 'error',
                        key: 'upload_too_large'
                    }
                }, file);}
            else {
                let formData = this.prepareStartFormdata(file);
                if (file.chunkmode) {
                    let chunkSize = this.opts.chunksize;
                    let totalChunks = Math.ceil(file.size / chunkSize);
                    this.onUploadPartailFile(formData, file, {
                        start: 0,
                        index: 0,
                        total: totalChunks
                    });
                } else
                    {this.sendArray(formData, file);}
            }
        },
        prepareStartFormdata: function (file) {
            const isChunkMode = (-1 !== this.MAX_POST_FILESIZE && file.size > this.MAX_POST_FILESIZE);
            if (isChunkMode) {
                const boundary = `----html5upload-${new Date().getTime()}${Math.floor(65535 * Math.random())}`;
                let contentPrefix = '';

                if (this.opts.params) {
                    for (const paramName in this.opts.params) {
                        if (this.opts.params.hasOwnProperty(paramName)) {
                            contentPrefix += `--${boundary}\r\n`;
                            contentPrefix += `Content-Disposition: form-data; name="${paramName}"\r\n\r\n`;
                            contentPrefix += `${unescape(encodeURIComponent(this.opts.params[paramName]))}\r\n`;
                        }
                    }
                }

                if (file.params) {
                    for (const paramName in file.params) {
                        if (file.params.hasOwnProperty(paramName)) {
                            contentPrefix += `--${boundary}\r\n`;
                            contentPrefix += `Content-Disposition: form-data; name="${paramName}"\r\n\r\n`;
                            contentPrefix += `${unescape(encodeURIComponent(file.params[paramName]))}\r\n`;
                        }
                    }
                }

                const filename = unescape(encodeURIComponent(file.name));
                contentPrefix += `--${boundary}\r\n`;
                contentPrefix += `Content-Disposition: form-data; name="${this.opts.filefiledname || 'file'}"; filename="${filename}"\r\n`;
                contentPrefix += 'Content-Type: application/octet-stream\r\n\r\n';

                return {
                    formData: contentPrefix,
                    boundary: boundary
                };
            } else {
                const formData = new FormData();

                if (this.opts.params) {
                    for (const paramName in this.opts.params) {
                        if (this.opts.params.hasOwnProperty(paramName)) {
                            formData.append(paramName, this.opts.params[paramName]);
                        }
                    }
                }

                if (file.params) {
                    for (const paramName in file.params) {
                        if (file.params.hasOwnProperty(paramName)) {
                            formData.append(paramName, file.params[paramName]);
                        }
                    }
                }

                return formData;
            }
        },
        onUploadPartailFile: function (e, t, i, o) {
            i.start = i.index * this.opts.chunksize;
            var chunkSize = Math.min(this.opts.chunksize, t.size - i.start);

            if ('PROCESSING' === t.status) {
                var fileSlice;

                if (window.File && File.prototype.slice) {
                    fileSlice = t.file.slice(i.start, i.start + chunkSize);
                } else if (window.File && File.prototype.webkitSlice) {
                    fileSlice = t.file.webkitSlice(i.start, i.start + chunkSize);
                } else if (window.File && File.prototype.mozSlice) {
                    fileSlice = t.file.mozSlice(i.start, i.start + chunkSize);
                } else {
                    this.onError({}, t);
                    return;
                }

                this.sendArray(e, t, fileSlice, i, o);
            }
        },
        _baseUrl: 'webapi/entry.cgi?',
        sendArray: function (formData, fileDetails, fileData, chunkDetails, tempFile) {
            var self = this;
            var headers = {}, requestParams = {};
            var uploadData;

            if (fileDetails.status !== 'CANCEL') {
                if (fileDetails.chunkmode) {
                    headers = {
                        'Content-Type': 'multipart/form-data; boundary=' + formData.boundary
                    };
                    requestParams = {
                        'X-TYPE-NAME': 'SLICEUPLOAD',
                        'X-FILE-SIZE': fileDetails.size,
                        'X-FILE-CHUNK-END': chunkDetails.total <= 1 || chunkDetails.index === chunkDetails.total - 1 ? 'true' : 'false'
                    };
                    if (tempFile) {
                        Ext.apply(requestParams, {
                            'X-TMP-FILE': tempFile
                        });
                    }
                    if (window.XMLHttpRequest.prototype.sendAsBinary) {
                        uploadData = formData.formData + (fileData !== '' ? fileData : '') + '\r\n--' + formData.boundary + '--\r\n';
                    } else if (window.Blob) {
                        var data = new Uint8Array(formData.formData.length + fileData.length + '\r\n--' + formData.boundary + '--\r\n'.length);
                        data.set(new TextEncoder().encode(formData.formData + fileData + '\r\n--' + formData.boundary + '--\r\n'));
                        uploadData = data;
                    }
                } else {
                    formData.append('size', fileDetails.size);
                    fileDetails.name
                        ? formData.append(this.opts.filefiledname, fileDetails, fileDetails.name)
                        : formData.append(this.opts.filefiledname, fileDetails.file);

                    uploadData = formData;
                }
                this.conn = new Ext.data.Connection({
                    method: 'POST',
                    url: `${this._baseUrl}api=SYNO.FileStation.Upload&method=upload&version=2&SynoToken=${localStorage['SynoToken']}`,
                    defaultHeaders: headers,
                    timeout: null
                });
                self.uploadedFilePath = `${this.opts.params.path}/${fileDetails.name}`;
                var request = this.conn.request({
                    headers: requestParams,
                    html5upload: true,
                    chunkmode: fileDetails.chunkmode,
                    uploadData: uploadData,
                    success: (response) => {
                        self.hideProgressIndicator();
                        self.updateHelper.updateFileInfoHandler({
                            path: self.uploadedFilePath
                        });
                    },
                    failure: (response) => {
                        self.parent && self.helper.unmask(self.parent);
                        self.hideProgressIndicator();
                        self.showMsg(`${self.helper.V('upload_file_dialog', 'file_uploading_failed_msg')}, Error: ${response.responseText}`);
                        console.error(self.helper.V('upload_file_dialog', 'file_uploading_failed_msg'), response);
                    },
                    progress: (progressEvent) => {
                        const percentage = ((progressEvent.loaded / progressEvent.total) * 100).toFixed(2);
                        let loader = document.getElementsByClassName('x-loading-message-inner');
                        if (loader?.length > 0) {
                            loader = loader[0];
                            loader.textContent = `${self.helper.T('common', 'loading')}. ${self.helper.V('upload_file_dialog', 'completed')} ${percentage}%.`;
                        }
                    },
                });
            }
        },
    });
