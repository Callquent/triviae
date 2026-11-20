const os = require("os");

// Cartes réseau virtuelles (WSL, Docker, VirtualBox, VPN…) : le téléphone ne peut pas les joindre.
const VIRTUAL = /vethernet|wsl|virtualbox|vbox|vmware|vmnet|docker|hyper-v|loopback|tailscale|zerotier|bluetooth|vpn|\btap\b|\btun\b|npcap|^veth|^br-|^br\d|^virbr|^lxd|^lxc|^podman|^cni|^flannel|^wg\d|^lo$|^vbox|^vmnet|^zt/i;

/** Adresses du PC sur le réseau local, la plus probable en premier. */
function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")) found.push({ ip: n.address, name });
    }
  }
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const wifiFirst = (n) => (/wi-?fi|wlan|wireless|sans fil/i.test(n) ? 0 : 1);
  return found.sort((a, b) => rank(a.ip) - rank(b.ip) || wifiFirst(a.name) - wifiFirst(b.name));
}

/** Adresses de diffusion (xxx.xxx.xxx.255) de chaque réseau local, pour annoncer ce PC aux autres. */
function broadcastAddresses() {
  const out = new Set();
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal || !n.netmask) continue;
      const ip = n.address.split('.').map(Number);
      const mask = n.netmask.split('.').map(Number);
      out.add(ip.map((b, i) => (b | (~mask[i] & 255))).join('.'));
    }
  }
  return [...out];
}

module.exports = { lanAddresses, broadcastAddresses };
