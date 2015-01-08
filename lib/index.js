var util = require('util'),
  EventEmitter = require('events').EventEmitter,
  mongodbUri = require('mongodb-uri'),
  mongo = require('mongodb'),
  BSON = mongo.BSONPure,
  Oplog = require('mongo-oplog'),
  parseNS = require('mongodb-ns'),
  _registry = require('./registry'),
  oplog_debug = require('debug')('mongodb-trigger:oplog');

var _names = {
  i: 'insert',
  u: 'update',
  d: 'delete'
};
function opname(op){
  return _names[op.op];
}

Oplog.prototype.tail = function tail(fn) {

  oplog_debug('Connecting to oplog database');

  var oplog = this;
  oplog.conn.ready(function ready(err, db) {
    oplog_debug('connection ready');

    if (err) return oplog.onerror(err);

    db.collection('system.namespaces').findOne({name: 'local.system.replset'}, function(err, doc){
      if (err) return oplog.onerror(err);

      if (!doc){
        if(fn){
          return fn(new Error('Not a replicaset'));
        }
        return oplog.onerror(err);
      }

      var time,
        since,
        query = {},
        options = {tailable: true, awaitdata: true, timeout: false, numberOfRetries: -1};

      db.collection(oplog.coll)
        .find({}, { ts: 1 })
        .sort({ ts: -1 })
        .limit(1)
        .nextObject(function next(err, doc) {
          if (err) {
            oplog_debug('stoping oplog because of error %j', err);
            if (fn) fn(err);
            oplog.onerror(err);
            return oplog.stop();
          }

          if (doc) {
            oplog.running = true;
            since = oplog.since ? oplog.since : (doc ? doc.ts : 0);
            if (since){
              time = { $gt: since };
            }
            else {
              time = { $gte: BSON.Timestamp(0, Date.now() / 1000) };
            }
            query.ts = time;
            if (oplog._ns) query.ns = oplog._ns;
            oplog_debug('starting cursor with query %j and options %j', query, options);
            oplog.stream = db.collection(oplog.coll).find(query, options).stream();
            oplog.bind();
            if (fn) fn(null, oplog.stream);
          } else {
            oplog.stop();
          }
        });
    });
  });

  return this;
};

Oplog.prototype.onerror = function onerror(err) {
  if (err && err.message){
    if(/cursor timed out/.test(err.message)) {
      oplog_debug('cursor timeout - re-tailing %j', err);
      this.tail();
      return this;
    }
    if(err.message === 'Connection Closed By Application'){
      // oplog_debug('eating connection closed psuedo error');
      // @todo: is mongo-oplog just not disconnecting correctly?
      return this;
    }

  }
  else {
    oplog_debug('unknow error %j', err);
    this.emit('error', err);
  }
  return this;
};

function Trigger(_id, ns, opts) {
  if(!(this instanceof Trigger)) return new Trigger(_id, ns, opts);
  this.debug = require('debug')('mongodb-trigger:' + _id);

  this._id = _id;
  opts = opts || {};
  opts.version = opts.version || '0.0.0';

  this.version = opts.version;
  this.collectionName = parseNS(ns).collection;
  this.databaseName = parseNS(ns).database;
  this.ns = [this.databaseName, this.collectionName].join('.');
  this.listening = false;

  _registry.add(this);
  this.debug('new trigger created for ns %s', ns);
}
util.inherits(Trigger, EventEmitter);

Trigger.prototype.listen = function(uri, fn){
  this.uri = uri;
  if(fn){
    this.once('connected', fn);
  }
  process.nextTick(this._connect.bind(this));
  this.debug('listening to %s for changes...', this.uri);
  return this;
};

Trigger.prototype.resume = function(){
  if(!this.uri) return this;

  this.debug('resuming');
  this.listen(this.uri);
  return this;
};

Trigger.prototype._connect = function(){
  mongo(this.uri, function(err, db){
    if(err) return this.emit('error', err);

    this.db = db;
    this.collection = this.db.collection(this.collectionName);

    var info = mongodbUri.parse(this.uri);
    info.database = 'local';
    this.oplog = new Oplog(mongodbUri.format(info), this.ns).tail(function(err){
      if(err) return this.emit('error', err);

      this.listening = true;
      this.debug('connected!');
      this.emit('connected');
    }.bind(this));

    this.oplog.filter('*.' + this.collectionName)
      .on('insert', this.onCreate.bind(this))
      .on('update', this.onUpdate.bind(this))
      .on('delete', this.onRemove.bind(this))
      .on('error', this.onError.bind(this))
      .on('end', this.onEnd.bind(this));
  }.bind(this));
  return this;
};

Trigger.prototype.resync = function(uri, fn){
  this.uri = uri;
  if(!this.db){
    return this._connect().on('connected', this.resync.bind(this, uri, fn));
  }

  this.resyncing = true;
  mongo(this.uri, function(err, db){
    if(err) return this.emit('error', err);

    this.db = db;
    this.collection = this.db.collection(this.collectionName);

    this.debug('%s: emitting resync', this._id);
    this.emit('resync', this.db, function(err){
      if(err){
        if(fn) return fn(err);

        return console.error(err) && process.exit(1);
      }

      this.debug('%s: resync complete', this._id);
      this.resyncing = false;
      if(fn) return fn();
    }.bind(this));
  }.bind(this));
  return this;
};

Trigger.prototype.close = function(fn){
  if(this.listening){
    this.debug('closing');
    return this.oplog.stop(function(){
      this.listening = false;
      if(this.db){
        return this.db.close(fn);
      }
      if(fn) return fn();
    }.bind(this));
  }

  if(this.db){
    return this.db.close(fn);
  }
  else {
    this.debug('closing is a noop');
    if(fn) return fn();
  }
};

Trigger.prototype._createHandlerCallback = function(op){
  return function(err){
    if(err) {
      return this.emit('error', err);
    }
    this.debug('synced %s successfully', opname(op));
    this.emit('synced', op);
  }.bind(this);
};

Trigger.prototype.onCreate = function(op) {
  this.debug('document created in %s with _id %s', op.ns, op.o._id);
  this.emit('created', this.db, op, this._createHandlerCallback(op));
};

Trigger.prototype.onUpdate = function(op) {
  this.debug('document updated in %s with _id %s', op.ns, op.o2._id);
  this.emit('updated', this.db, op, this._createHandlerCallback(op));
};

Trigger.prototype.onRemove = function(op) {
  this.debug('document removed from %s with _id %s', op.ns, op.o._id);
  this.emit('removed', this.db, op, this._createHandlerCallback(op));
};

Trigger.prototype.onError = function(err) {
  this.debug('oplog error', err);
  this.emit('error', err);
};

Trigger.prototype.onEnd = function() {
  this.debug('end');
  this.emit('end');
};

module.exports = {
  create: function (_id, ns, opts){
    return new Trigger(_id, ns, opts);
  },
  listen: function(uri){
    var triggers = _registry.all();

    triggers.map(function(trigger){
      trigger.listen(uri);
    });
    return triggers;
  }
};
