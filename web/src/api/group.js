function Group() {
  this.groups = require('./groups.json');
}

Group.prototype = {

  getByAsset: function (lang, assetId) {
    const groups = this.groups;
    for (var i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.asset_id === assetId && lang.slice(0, group.lang.length) === group.lang) {
        return group;
      }
    }
    return undefined;
  }
}

export default Group;
