export default Ext.define('SYNOCOMMUNITY.RRManager.Overview.HealthPanel', {
  extend: 'SYNO.ux.Panel',
  apiProvider: SYNOCOMMUNITY.RRManager.SynoApiProvider,
  constructor: function (e) {
    this.appWin = e.appWin;
    this.owner = e.owner;
    this.helper = e.owner.helper;
    this.apiProvider.init(this);
    this.callParent([this.fillConfig(e)]);
  },
  onDataReady: function () {
    let status = 'normal';
    this.iconTemplate.overwrite(this.getComponent('icon').getEl(), {
      status: status,
      style:
        "background-image:url('webapi/entry.cgi?api=SYNO.Core.Synohdpack&version=1&method=getHDIcon&res=72&retina=false&path=webman/3rdparty/rr-manager/images/rr-manager-{0}.png&app_version=0.1'); background-size: cover;",
    }),
      this.titleTemplate.overwrite(this.upperPanel.getComponent('title').getEl(), {
        status: status,
      }),
      this.updateDescription('current');
    // this.getComponent("rrActionsPanel")?.setVisible(true);
    this.owner.fireEvent('data_ready');
  },

  fillConfig: function (e) {
    this.poolLinkId = Ext.id();
    this.iconTemplate = this.createIconTpl();
    this.titleTemplate = this.createTitleTpl();
    this.upperPanel = this.createUpperPanel();
    this.lowerPanel = this.createLowerPanel();

    this.descriptionMapping = {
      normal: this.helper.V('ui', 'greetings_text'),
      target_abnormal: [],
    };

    const panelConfig = {
      layout: 'hbox',
      cls: 'iscsi-overview-health-panel',
      autoHeight: true,
      items: [
        { xtype: 'box', itemId: 'icon', cls: 'health-icon-block' },
        {
          xtype: 'syno_panel',
          itemId: 'rightPanel',
          cls: 'health-text-block',
          flex: 1,
          height: 90,
          layout: 'vbox',
          layoutConfig: { align: 'stretch' },
          items: [this.upperPanel, this.lowerPanel],
        },
      ],
      listeners: { scope: this, data_ready: this.onDataReady },
    };
    return Ext.apply(panelConfig, e), panelConfig;
  },
  createIconTpl: function () {
    return new Ext.XTemplate('<div class="health-icon {status}" style="{style}"></div>', {
      compiled: !0,
      disableFormats: !0,
    });
  },
  createTitleTpl: function () {
    return new Ext.XTemplate(
      '<div class="health-text-title {status}">{[this.getStatusText(values.status)]}</div>',
      {
        compiled: !0,
        disableFormats: !0,
        statusText: {
          normal: 'Healthy',
          warning: 'Warning',
          error: 'Error',
        },
        getStatusText: function (e) {
          return this.statusText[e];
        },
      }
    );
  },
  createUpperPanel: function () {
    return new SYNO.ux.Panel({
      layout: 'hbox',
      items: [
        {
          xtype: 'box',
          itemId: 'title',
          flex: 1,
          cls: 'iscsi-overview-health-title-block',
        },
        {
          xtype: 'syno_button',
          itemId: 'leftBtn',
          hidden: !0,
          cls: 'iscsi-overview-health-prev-btn',
          scope: this,
          handler: this.onLeftBtnClick,
          text: ' ',
        },
        {
          xtype: 'syno_button',
          itemId: 'rightBtn',
          hidden: !0,
          cls: 'iscsi-overview-health-next-btn',
          scope: this,
          handler: this.onRightBtnClick,
          text: ' ',
        },
      ],
    });
  },
  createLowerPanel: function () {
    return new SYNO.ux.Panel({
      flex: 1,
      items: [
        {
          xtype: 'syno_displayfield',
          itemId: 'desc',
          cls: 'health-text-content',
          htmlEncode: !1,
        },
      ],
    });
  },
  updateDescription: function (status) {
    const self = this;
    this.descriptions = [];
    const rightPanel = this.getComponent('rightPanel'),
      descriptionField = this.lowerPanel.getComponent('desc'),
      leftButton = this.upperPanel.getComponent('leftBtn'),
      rightButton = this.upperPanel.getComponent('rightBtn');
    const initialHeight = descriptionField.getHeight();
    let panelHeight = rightPanel.getHeight(),
      isHeightChanged = false;
    descriptionField.setValue(self.owner.systemInfoTxt);

    const updatedHeight = descriptionField.getHeight();
    if (
      (updatedHeight !== initialHeight &&
        ((panelHeight = panelHeight - initialHeight + updatedHeight), (isHeightChanged = true)),
      isHeightChanged &&
        ((rightPanel.height = panelHeight), this.doLayout(), this.owner.doLayout()),
      this.descriptions.length <= 1)
    ) {
      return leftButton.hide(), void rightButton.hide();
    }
    (leftButton.hidden || rightButton.hidden) &&
      (leftButton.show(), rightButton.show(), this.doLayout());
  },
  prepareSummaryStatus: function (status, data) {
    // Function body goes here
  },
});
