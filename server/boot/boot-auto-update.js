/* eslint-disable */

module.exports = function automigratebootFn(app) {
  var ds = app.dataSources.db;
  ds.autoupdate(function () {
    ds.discoverModelProperties('MasterLock', function (err, props) {
      console.log('discoverModelProperties props:', props);
      /* istanbul ignore if */
      if (err) {
        console.log('Error while performing discoverModelProperties:', err);
        throw err;
      } else {
        console.log('Done discoverModelProperties successfully');
      }
    });
  });
};
