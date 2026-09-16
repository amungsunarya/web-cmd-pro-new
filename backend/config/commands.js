const os = require('os');
const isWindows = os.platform() === 'win32';

const ALLOWED_BINARIES = new Set([
  'ping','tracert','traceroute','nslookup','netstat','arp','ipconfig','ifconfig',
  'route','getmac','tasklist','ps','systeminfo','hostname','whoami','date','time',
  'dir','ls','telnet','net','curl','wget'
]);

const COMMANDS = [
  { id:'ping', label:'Ping (4x)', cmd:'ping',
    args: h => isWindows?['-n','4',h]:['-c','4',h],
    category:'Jaringan', needsTarget:true, targetLabel:'IP / Hostname' },

  { id:'ping-size', label:'Ping Paket 1500B', cmd:'ping',
    args: h => isWindows?['-n','4','-l','1472',h]:['-c','4','-s','1472',h],
    category:'Jaringan', needsTarget:true, targetLabel:'IP / Hostname' },

  { id:'tracert', label:'Traceroute', cmd:isWindows?'tracert':'traceroute',
    args: h => isWindows?['-d','-h','15',h]:['-n','-m','15',h],
    category:'Jaringan', needsTarget:true, targetLabel:'IP / Hostname' },

  { id:'nslookup', label:'DNS Lookup', cmd:'nslookup',
    args: h => [h], category:'Jaringan', needsTarget:true, targetLabel:'Domain / IP' },

  { id:'netstat', label:'Koneksi Aktif', cmd:'netstat',
    args: () => ['-an'], category:'Jaringan', needsTarget:false },

  { id:'netstat-p', label:'Koneksi + PID', cmd:'netstat',
    args: () => ['-ano'], category:'Jaringan', needsTarget:false },

  { id:'arp', label:'Tabel ARP', cmd:'arp',
    args: () => ['-a'], category:'Jaringan', needsTarget:false },

  { id:'route', label:'Tabel Routing', cmd:isWindows?'route':'ip',
    args: () => isWindows?['print']:['route'], category:'Jaringan', needsTarget:false },

  { id:'getmac', label:'MAC Address', cmd:isWindows?'getmac':'ip',
    args: () => isWindows?[]:['link'], category:'Jaringan', needsTarget:false },

  { id:'ipconfig', label:'IP Config', cmd:'ipconfig',
    args: () => isWindows?[]:['-a'], category:'Sistem', needsTarget:false },

  { id:'ipconfig-a', label:'IP Config (lengkap)', cmd:'ipconfig',
    args: () => isWindows?['/all']:['-a'], category:'Sistem', needsTarget:false },

  { id:'flushdns', label:'Reset DNS Cache', cmd:'ipconfig',
    args: () => isWindows?['/flushdns']:['--flush'], category:'Sistem', needsTarget:false },

  { id:'hostname', label:'Nama Komputer', cmd:'hostname',
    args: () => [], category:'Sistem', needsTarget:false },

  { id:'whoami', label:'User Aktif', cmd:'whoami',
    args: () => [], category:'Sistem', needsTarget:false },

  { id:'tasklist', label:'Proses Aktif', cmd:isWindows?'tasklist':'ps',
    args: () => isWindows?[]:['aux'], category:'Sistem', needsTarget:false },

  { id:'systeminfo', label:'Info Sistem Lengkap', cmd:'systeminfo',
    args: () => [], category:'Sistem', needsTarget:false, timeout:60000 },

  { id:'date', label:'Waktu Sistem', cmd:isWindows?'time':'date',
    args: () => isWindows?['/t']:[], category:'Sistem', needsTarget:false },

  { id:'dir', label:'Daftar File Folder', cmd:isWindows?'dir':'ls',
    args: () => [], category:'File', needsTarget:false, cwd:os.homedir() },
];

module.exports = { ALLOWED_BINARIES, COMMANDS };