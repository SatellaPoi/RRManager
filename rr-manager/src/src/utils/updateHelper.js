// Namespace definition
Ext.ns('SYNOCOMMUNITY.RRManager');
export default SYNOCOMMUNITY.RRManager.UpdateHelper = {
  init: function (apiProvider, findAppWindow) {
    this.apiProvider = apiProvider;
    this.appWin = findAppWindow.appWin;
    this.helper = findAppWindow.helper;
    this.showMsg = findAppWindow.showMsg.bind(findAppWindow);
  },
  updateFileInfoHandler: async function (fileInfo) {
    if (!fileInfo) {
      this.showMsg('File path is not provided');
      return;
    }
    let sharesList = JSON.parse(localStorage.getItem('sharesList') || '[]');
    let shareName = fileInfo.path.split('/')[1];
    let shareInfo = sharesList.find(
      share => share.name.toLocaleLowerCase() === shareName.toLocaleLowerCase()
    );
    if (!shareInfo) {
      this.showMsg('Share not found');
      return;
    }
    var shareRealPath = shareInfo.additional.real_path;
    let newFilePath = shareRealPath.replace(shareName, fileInfo.path.slice(1));
    try {
      await this.onRunRrUpdateManuallyClick(newFilePath);
    } catch (error) {
      this.showMsg(`Error. ${error}`);
    }
  },
  MAX_POST_FILESIZE: Ext.isWebKit
    ? -1
    : window.console && window.console.firebug
      ? 20971521
      : 4294963200,
  onRunRrUpdateManuallyClick: async function (updateFilePath) {
    const rrConfigJson = localStorage.getItem('rrConfig');
    const rrConfig = JSON.parse(rrConfigJson);

    const confirmUpload = () => {
      return new Promise((resolve, reject) => {
        try {
          this.appWin.getMsgBox().confirmDelete(
            'Confirm',
            this.helper.V('upload_file_dialog', 'file_uploading_succesfull_msg'),
            result => {
              resolve(result === 'yes');
            },
            null,
            {
              yes: {
                text: this.helper.T('common', 'yes'),
                btnStyle: 'red',
              },
              no: { text: Ext.MessageBox.buttonText.no },
            }
          );
        } catch (error) {
          console.error('Error in confirmUpload:', error);
          reject(error);
        }
      });
    };

    const confirmUpdate = (currentRrVersion, updateRrVersion) => {
      return new Promise((resolve, reject) => {
        try {
          this.appWin.getMsgBox().confirmDelete(
            'Confirmation',
            this.helper.formatString(
              this.helper.V('upload_file_dialog', 'update_rr_confirmation'),
              currentRrVersion,
              updateRrVersion
            ),
            userResponse => {
              resolve(userResponse === 'yes');
            },
            null,
            {
              yes: {
                text: this.helper.V('upload_file_dialog', 'btn_proceed'),
                btnStyle: 'red',
              },
              no: { text: this.helper.T('common', 'cancel') },
            }
          );
        } catch (error) {
          console.error('Error in confirmUpdate:', error);
          reject(error);
        }
      });
    };

    if (await confirmUpload()) {
      try {
        const responseText = await this.apiProvider.getUpdateFileInfo(updateFilePath);
        if (!responseText.success) {
          this.helper.unmask(this.appWin);
          this.showMsg(
            this.helper.formatString(
              this.helper.V('upload_file_dialog', 'unable_update_rr_msg'),
              responseText?.error ?? 'No response from the scripts/readUpdateFile.cgi script.'
            )
          );
          return;
        }
        const configName = 'rrUpdateFileVersion';
        this[configName] = responseText;
        const currentRrVersion = rrConfig.rr_version.LOADERVERSION;
        const updateRrVersion = this[configName].updateVersion;

        if (await confirmUpdate(currentRrVersion, updateRrVersion)) {
          this.helper.mask(this.appWin);
          await this.apiProvider.callCustomScript(`runRrUpdate.cgi?file=${encodeURIComponent(updateFilePath)}`);
          const maxCountOfRefreshUpdateStatus = 350;
          let countUpdatesStatusAttemp = 0;

          const checkUpdateStatus = async () => {
            try {
              const checksStatusResponse = await this.apiProvider.callCustomScript(
                'checkUpdateStatus.cgi?filename=rr_update_progress'
              );
              if (!checksStatusResponse?.success) {
                this.helper.unmask(this.appWin);
                this.showMsg(checksStatusResponse?.status);
                return false;
              }
              const response = checksStatusResponse.result;
              this.helper.mask(
                this.appWin,
                this.helper.formatString(
                  this.helper.V('upload_file_dialog', 'update_rr_progress_msg'),
                  response?.progress ?? '--',
                  response?.progressmsg ?? '--'
                ),
                'x-mask-loading'
              );
              countUpdatesStatusAttemp++;
              if (
                countUpdatesStatusAttemp === maxCountOfRefreshUpdateStatus ||
                response?.progress?.startsWith('-')
              ) {
                this.helper.unmask(this.appWin);
                this.showMsg(
                  this.helper.formatString(
                    this.helper.V('upload_file_dialog', 'update_rr_progress_msg'),
                    response?.progress,
                    response?.progressmsg
                  )
                );
                return false;
              } else if (response?.progress === '100') {
                this.helper.unmask(this.appWin);
                this.showMsg(this.helper.V('upload_file_dialog', 'update_rr_completed'));
                return false;
              }
              return true;
            } catch (error) {
              console.error('Error in checkUpdateStatus:', error);
              this.helper.unmask(this.appWin);
              this.showMsg(`Error in checkUpdateStatus: ${error}`);
              return false;
            }
          };

          while (await checkUpdateStatus()) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      } catch (error) {
        console.error('Error in onRunRrUpdateManuallyClick:', error);
        this.showMsg(`Error. ${error}`);
      }
    }
  },
};
