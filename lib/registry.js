var util = require('util');
var EventEmitter = require('events').EventEmitter;

function Registry(){
  this.triggers = [];
}
util.inherits(Registry, EventEmitter);

Registry.prototype.add = function(trigger){
  this.triggers.push(trigger);
  this.emit('added', trigger);
  return this;
};

Registry.prototype.all = function(){
  return this.triggers;
};

module.exports = new Registry();
