var assert = require('assert'),
  trigger = require('../'),
  startMongo = require('mongodb-runner');

describe('trigger', function(){
  var mongo;
  before(function(done){
    mongo = startMongo('replicaset', {name: 'trigger_testing', port: 27800}, done);
  });
  after(function(done){
    mongo.on('end', done).teardown();
  });
  it('should work', function(done){
    setTimeout(function(){
    var ns = 'trigger.pets';
    var uri = mongo.options.get('uri') + '/trigger';
    var seen = false;

    var order = trigger.create('food orders', ns, {version: '0.0.0'})
      .on('created', function(db, op, fn){
        seen = true;
        fn();
      })
      .on('synced', done.bind(null, null))
      .on('error', done)
      .on('connected', function(){
        order.collection.insert({_id: 1, name: 'Arlo', type: 'dog'}, function(err){
          assert.ifError(err);
        });
      })
      .listen(uri);
    }, 5000);
  });
});
