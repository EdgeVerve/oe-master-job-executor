module.exports = function automigratebootFn(app) {
    var ds = app.dataSources.db;
    ds.autoupdate(function () {
        ds.discoverModelProperties('MasterLock', function (err, props) {
        });
  });
};
