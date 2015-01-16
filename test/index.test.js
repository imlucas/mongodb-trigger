var assert = require('assert'),
  trigger = require('../'),
  startMongo = require('mongodb-runner'),
  debug = require('debug')('mongodb-trigger:test');

describe('trigger', function(){
  var mongo;
  before(function(done){
   debug('replicaset starting...');
    mongo = startMongo('replicaset', {name: 'trigger_testing', port: 27800}, function(err){
      if(err) return done(err);

        debug('replicaset ready mongodb://localhost:27800');
        done();
    });
  });
  after(function(done){
    debug('replicaset stopping...');
    mongo.on('end', function(){
      debug('replicaset destroyed!');
      done();
    }).teardown();
  });
  it('should work', function(done){
    var ns = 'trigger.pets';
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
      .listen('mongodb://localhost:27800');
  });
});
