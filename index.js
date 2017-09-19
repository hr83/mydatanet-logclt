var net = require('net');
var put = require('put');
var util = require('util');
var crypto = require('crypto');
var events = require('events');

var cfg =
{
  "log_port": 17222,
	"log_ip": '127.0.0.1'
};

//----------------------------------------------------------------------------------------------------
// Creates a TCP/IP connection to the log server on port 17222
//----------------------------------------------------------------------------------------------------
function Connection()
{
    this.log_socket = net.Socket();
    this.activeLog = false;
    this.log_queue = [];
    this.logConnected = false;

    var self = this;

    this.log_socket.on('error', function (e) {
      console.log(e);
    });

    this.log_socket.on('close', function (e) {
      self.logConnected = false;
    });

    this.log_socket.on('connect', function () {
      self.logConnected = true;
      self.startNextLogRequest();
    });
}

//----------------------------------------------------------------------------------------------------
Connection.prototype.__proto__ = events.EventEmitter.prototype;

//----------------------------------------------------------------------------------------------------
// for internal use only
//----------------------------------------------------------------------------------------------------
Connection.prototype.startLogRequest = function(buf)
{
    this.log_queue.push(buf);
    this.startNextLogRequest();
}

//----------------------------------------------------------------------------------------------------
// for internal use only
//----------------------------------------------------------------------------------------------------
Connection.prototype.startNextLogRequest = function()
{
    if(!this.log_queue.length)
        return;

    if(this.activeLog)
      return;

    this.activeLog = true;

    var self = this;

    if(!this.logConnected) {
      if(!this.log_socket.connecting) {
        this.log_socket.connecting = true;
		this.log_socket.connect(cfg.log_port, cfg.log_ip);
	  }
      this.activeLog = false;
      return;
    }

    var buf = this.log_queue.shift();

    this.log_socket.write(buf, function() {
      self.activeLog = false;
      self.startNextLogRequest();
    });
};

//----------------------------------------------------------------------------------------------------
// Close all TCP/IP connections
//----------------------------------------------------------------------------------------------------
Connection.prototype.destroy = function ()
{
    this.log_socket.destroy();
}

//----------------------------------------------------------------------------------------------------
// write log entry
//
// type......one of the LOG_... types
module.exports.LOG_SYSERR = 0x1000;
module.exports.LOG_ALARM  = 0x2000;
module.exports.LOG_WARN   = 0x3000;
module.exports.LOG_USERACTION = 0x4000;
module.exports.LOG_SYSACTION = 0x5000;
module.exports.LOG_INFO = 0x6000;
module.exports.LOG_DEBUG = 0x7000;
// source....string which is written as "source" to the log (Ex. function or module name)
// text......string to write as text to the log file
// dbevent...string if "1" or "2" the log message is also written into the server events (1 ... warning, 2 ... alarm)
//----------------------------------------------------------------------------------------------------
Connection.prototype.log = function (type, source, text, dbevent)
{
	try {
        console.log(type, source, text, dbevent);
		this.doLog(type, source, text, dbevent);
	}
	catch(err) {
		this.doLog(0x1000, source, "LOG WARNING: " + err.message + " / Text" + text, 1);
	}
};

// source....string which is written as "source" to the log (Ex. function or module name)
// text......string to write as text to the log file
// dbevent...string if "1" or "2" the log message is also written into the server events (1 ... warning, 2 ... alarm)
//----------------------------------------------------------------------------------------------------
Connection.prototype.doLog = function (type, source, text, dbevent) {
    dbevent = dbevent || '';

    var msgLen = 8 + 4 + source.length + 2 + text.length + 1 + dbevent.length + 1;
    var buf = new Buffer(4 + msgLen + 4);

    var now = new Date();
    var off = new Date(1999, 11, 31);
    var tz1  = now.getTimezoneOffset() * 60000;
    var tz2  = off.getTimezoneOffset() * 60000;
    var ms  = ( (now - tz1) - (off - tz2)) * 65.536;
    
    var msh = Math.floor(ms / 0xFFFFFFFF);
    var msl = Math.floor(ms % 0xFFFFFFFF);
    
    var off = 0;
    buf.writeInt32LE(msgLen, off);     off += 4;
    
    buf.writeUInt32LE(msl, off);       off += 4;
    buf.writeUInt32LE(msh, off);       off += 4;
    
    buf.writeInt32LE(type, off);       off += 4;
    buf.write(source, off);            off += source.length;
    buf.writeUInt8(2, off);            off += 1;
    buf.writeUInt8(2, off);            off += 1;
    buf.write(text, off);              off += text.length;
    buf.writeUInt8(2, off);            off += 1;
    buf.write(dbevent, off);           off += dbevent.length;
    buf.writeUInt8(2, off);            off += 1;
    buf.writeInt32LE(msgLen, off);
            
    this.startLogRequest(buf);
};


module.exports.Connection = Connection;
module.exports.Cfg = cfg;
