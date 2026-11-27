const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STATUS = {
  running: ["en ligne", "ok"],
  starting: ["démarrage…", "wait"],
  crashed: ["s'est arrêtée, redémarrage…", "bad"],
  stopped: ["arrêtée", "bad"],
};

const THEMES = {
  ocean: { label: "Océan", color: "#1f5fa8" },
  violet: { label: "Violet", color: "#5b3fb5" },
  terracotta: { label: "Terracotta", color: "#b5502d" },
  ardoise: { label: "Ardoise", color: "#3b4a5e" },
  foret: { label: "Forêt", color: "#24573f" },
};
const THEME_CSS = `
:root{--bg:#eaf0f7;--surface:#fff;--ink:#14212f;--muted:#59697a;--line:#d0dbe8;--g7:#1f5fa8;--g8:#174a85;--g1:#e0ebf8;--sun:#e0a82e;--bad:#b3392c}
@media (prefers-color-scheme:dark){:root{--bg:#0e1722;--surface:#172433;--ink:#e6eef7;--muted:#9db0c3;--line:#2a3b4f;--g1:#1d3248;--g7:#5aa2e6;--g8:#86bcf0}}
html[data-theme=ocean]{--bg:#eaf0f7;--surface:#fff;--ink:#14212f;--muted:#59697a;--line:#d0dbe8;--g7:#1f5fa8;--g8:#174a85;--g1:#e0ebf8}
@media (prefers-color-scheme:dark){html[data-theme=ocean]{--bg:#0e1722;--surface:#172433;--ink:#e6eef7;--muted:#9db0c3;--line:#2a3b4f;--g1:#1d3248;--g7:#5aa2e6;--g8:#86bcf0}}
html[data-theme=violet]{--bg:#efecf8;--surface:#fff;--ink:#1f1930;--muted:#665f7c;--line:#dcd6ee;--g7:#5b3fb5;--g8:#46309a;--g1:#e8e2f7}
@media (prefers-color-scheme:dark){html[data-theme=violet]{--bg:#15111f;--surface:#211a31;--ink:#ece8f6;--muted:#aaa2c0;--line:#382f50;--g1:#2b2145;--g7:#9c84ea;--g8:#b8a6f2}}
html[data-theme=terracotta]{--bg:#f6eee9;--surface:#fff;--ink:#2b1b14;--muted:#7a6458;--line:#e6d6cb;--g7:#b5502d;--g8:#93401f;--g1:#f6e3da}
@media (prefers-color-scheme:dark){html[data-theme=terracotta]{--bg:#1c120d;--surface:#2a1b14;--ink:#f4e8e1;--muted:#c2a99b;--line:#46302a;--g1:#3a2419;--g7:#e48a62;--g8:#efa684}}
html[data-theme=ardoise]{--bg:#eceef1;--surface:#fff;--ink:#151a22;--muted:#5d6673;--line:#d6dae0;--g7:#3b4a5e;--g8:#2b3849;--g1:#e3e7ec}
@media (prefers-color-scheme:dark){html[data-theme=ardoise]{--bg:#12161c;--surface:#1c222b;--ink:#e8ecf1;--muted:#a0a9b6;--line:#2d3541;--g1:#252d38;--g7:#8fa3bd;--g8:#adbdd2}}
html[data-theme=foret]{--bg:#ebf0ea;--surface:#fff;--ink:#17261e;--muted:#5b6b61;--line:#d3ddd5;--g7:#24573f;--g8:#1c4632;--g1:#e4efe3}
@media (prefers-color-scheme:dark){html[data-theme=foret]{--bg:#0f1913;--surface:#18271e;--ink:#e6efe8;--muted:#9fb0a5;--line:#2b3d31;--g1:#1f3327;--g7:#58a67d;--g8:#7cc29d}}
`;
let currentTheme = "ocean";
const setTheme = (t) => { if (Object.prototype.hasOwnProperty.call(THEMES, t)) currentTheme = t; return currentTheme; };
const getTheme = () => currentTheme;

const CSS = `
${THEME_CSS}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:28px 16px 48px;display:grid;gap:28px}
h1,h2{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-weight:700;letter-spacing:-.01em;margin:0;line-height:1.15}h1{font-size:2rem}h2{font-size:1.3rem}
p{margin:0}.muted{color:var(--muted)}a{color:var(--g7)}
.tiles{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));list-style:none;margin:0;padding:0}
.tile{background:var(--surface);border-radius:18px;box-shadow:0 0 0 1px var(--line);padding:16px;display:grid;gap:12px;align-content:start}
.tile header{display:flex;gap:12px;align-items:center}.tile img,.ph{width:52px;height:52px;border-radius:13px;background:var(--g1);flex:none;object-fit:cover}
.ph{display:grid;place-items:center;font-weight:700;color:var(--g7);font-size:1.4rem}
.tile h3{margin:0;font:700 1.1rem system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}.pill{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted)}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--muted)}.pill.ok::before{background:#2f9e63}.pill.wait::before{background:var(--sun)}.pill.bad::before{background:var(--bad)}
.row{display:flex;flex-wrap:wrap;gap:8px}
.btn{font-family:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:11px;background:var(--g7);color:#fff;font-weight:600;text-decoration:none;border:0;font-size:.95rem;cursor:pointer}
.btn.quiet{background:none;color:var(--g7);box-shadow:inset 0 0 0 1px var(--line)}.btn.small{min-height:36px;padding:0 12px;font-size:.85rem}
.panel{background:var(--surface);border-radius:18px;box-shadow:0 0 0 1px var(--line);padding:18px;display:grid;gap:14px}
.qrbox{display:grid;gap:10px;justify-items:center}.qrcap{font-size:.8rem;color:var(--muted);font-weight:600}
.pdlg .qr{width:200px;height:200px;border-radius:14px;padding:10px;background:#fff;box-shadow:0 0 0 1px var(--line),0 6px 18px -10px rgba(20,30,50,.4)}
.steps{margin:0;padding:0;list-style:none;counter-reset:s;display:grid;gap:8px;font-size:.93rem;color:var(--ink)}
.steps li{counter-increment:s;display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start}.steps li::before{content:counter(s);display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--g1);color:var(--g7);font-weight:700;font-size:.8rem}
.addr{display:flex;gap:8px;align-items:center;background:var(--g1);border-radius:12px;padding:6px 6px 6px 14px}.addr code{flex:1;min-width:0;font-size:.95rem}.addr .btn{min-height:44px;flex:none}
.filefield{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}.filefield:focus-within{border-color:var(--g7)}
.filefield input{flex:1;width:0;min-width:0;min-height:42px;border:0;outline:0;padding:0 12px;font:inherit;background:transparent;color:var(--ink)}
.filefield button{flex:none;border:0;border-left:1px solid var(--line);background:var(--g1);color:var(--g7);font:inherit;font-weight:600;padding:0 16px;min-height:44px;cursor:pointer}.filefield button:hover{background:color-mix(in srgb,var(--g7) 14%,var(--g1))}.filefield button:disabled{opacity:.6;cursor:wait}
.tabs2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tabcard{display:flex;align-items:center;gap:12px;text-align:left;padding:14px 16px;border:0;border-radius:16px;background:var(--surface);box-shadow:0 0 0 1px var(--line);cursor:pointer;color:var(--ink);font:inherit;min-height:64px;transition:box-shadow .15s}
.tabcard:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--g7) 45%,var(--line))}.tabcard[aria-selected=true]{box-shadow:0 0 0 2px var(--g7);background:color-mix(in srgb,var(--g7) 6%,var(--surface))}
.tabcard .ti,.stat .si,.peercard .si,.empty .si,.opt .oi{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--g1);color:var(--g7);flex:none}
.tabcard svg,.stat svg,.peercard svg,.empty svg,.opt svg,.drive svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.tabcard .tt{display:grid;flex:1;min-width:0;line-height:1.3}.tabcard small{color:var(--muted);font-size:.82rem}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:.76rem;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--g1);color:var(--muted);white-space:nowrap;flex:none}
.badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.badge.ok{background:#e3f5ec;color:#1f7a4d}.badge.wait{background:#fdf1d8;color:#8a5a00}.badge.bad{background:#fde7e5;color:#b3261e}
.stat{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;background:var(--g1)}.stat .sx{display:grid;gap:2px;flex:1;min-width:12rem}.stat .sx .muted{font-size:.82rem}.stat code{font-size:.95rem}.stat .si{background:var(--surface)}
.steps3{list-style:none;margin:0;padding:0;display:grid;gap:18px}.steps3 .sh{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.steps3 .n{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--g7);color:#fff;font-weight:700;font-size:.82rem;flex:none}
.drives{display:grid;gap:8px}.drive{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;min-height:56px}
.drive:hover{border-color:var(--g7)}.drive .di{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--g1);color:var(--g7);flex:none}
.drive .dt{display:grid;flex:1;min-width:0;line-height:1.3}.drive small{color:var(--muted);font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drive .dck{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;flex:none;color:transparent}.drive .dck svg{width:14px;height:14px;stroke-width:3}
.drive.sel{border-color:var(--g7);background:color-mix(in srgb,var(--g7) 6%,var(--surface))}.drive.sel .dck{background:var(--g7);border-color:var(--g7);color:#fff}
.hint{font-size:.9rem;color:var(--muted);margin:0}.help summary{color:var(--muted);font-size:.9rem}.help p{margin:8px 0 0;font-size:.88rem}
.peers{display:grid;gap:10px}.peercard,.empty{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--line)}
.peercard{flex-wrap:wrap}.peercard .sx{display:grid;gap:2px;flex:1;min-width:12rem}.empty>div{min-width:0}.empty{background:var(--g1);border-style:dashed;border-style:solid;border-color:transparent}.empty .si{background:var(--surface)}
.opts2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.opt{display:grid;gap:8px;align-content:start;padding:16px;border-radius:14px;border:1px solid var(--line)}.opt p{margin:0;font-size:.9rem}.opt .btn{justify-self:start}
.fl{display:grid;gap:3px;font-size:.85rem}.fl input{min-height:44px;border-radius:10px;border:1px solid var(--line);padding:0 12px;font:inherit;background:var(--surface);color:var(--ink)}.fl input:focus{outline:2px solid var(--g7);outline-offset:-1px}
.bigcode{display:grid;gap:8px}.kv{display:flex;align-items:baseline;gap:10px}.kv span{width:4.5rem;color:var(--muted);font-size:.85rem}.kv .num{font-size:1.7rem;letter-spacing:.1em}
.switch{display:inline-flex;align-items:center;gap:10px;border:0;background:none;padding:6px 0;cursor:pointer;color:var(--ink);font:inherit;font-size:.9rem;font-weight:600;min-height:44px}
.switch .knob{position:relative;width:42px;height:24px;border-radius:99px;background:#b9c0cc;transition:background .15s;flex:none}.switch .knob::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.switch.on .knob{background:var(--g7)}.switch.on .knob::after{transform:translateX(18px)}
@media(max-width:700px){.tabs2{grid-template-columns:1fr}.opts2{grid-template-columns:1fr}.tabcard .badge{display:inline-flex}}
@media(prefers-reduced-motion:reduce){.switch .knob,.switch .knob::after,.tabcard{transition:none}}
.themes{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
.sw2{position:relative;display:grid;gap:8px;padding:10px;border:0;border-radius:14px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;color:var(--ink);font:inherit;text-align:left}
.sw2:hover{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c,var(--g7)) 50%,var(--line))}.sw2[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--g7)}
.sw2 .prev{display:grid;grid-template-columns:1.4fr 1fr;grid-template-rows:14px 14px;gap:4px;padding:8px;border-radius:9px;background:color-mix(in srgb,var(--c) 10%,#fff)}
.sw2 .prev i{border-radius:4px;background:color-mix(in srgb,var(--c) 22%,#fff)}.sw2 .prev i:first-child{grid-row:span 2;background:var(--c)}
.sw2 .lb{font-weight:600;font-size:.92rem}.sw2 .ck{position:absolute;top:14px;right:14px;width:20px;height:20px;border-radius:50%;background:var(--g7);color:#fff;display:none;place-items:center}.sw2 .ck svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}.sw2[aria-pressed=true] .ck{display:grid}
.appcard{display:grid;gap:12px;padding:14px;border:1px solid var(--line);border-radius:14px}
.appcard .ah{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.appcard .ai{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--g1);color:var(--g7);flex:none}.appcard .ai svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.appcard .at{display:grid;gap:2px;flex:1;min-width:8rem;justify-items:start}.appcard .btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px;margin-right:4px}
.info{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}.info div{background:var(--g1);border-radius:8px;padding:6px 10px;min-width:0}.info dt{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.info dd{margin:0;font-weight:600;font-size:.9rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.setrow{display:flex;align-items:center;justify-content:space-between;gap:16px}.appcard .setrow{padding-top:12px;border-top:1px solid var(--line)}.setrow .st{display:grid;gap:2px;min-width:0}.setrow .muted{font-size:.88rem}
.note{display:flex;gap:12px;align-items:flex-start;margin:0;padding:12px 14px;border-radius:12px;background:#fdf1d8;color:#6b4a06;font-size:.9rem}.note .ni{flex:none;display:grid;place-items:center}.note svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media(prefers-color-scheme:dark){.note{background:#3a2f12;color:#f3d890}}
@media(max-width:700px){.themes{grid-template-columns:repeat(2,1fr)}}
.phone-cta{display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 18px 6px 10px;border:1px solid color-mix(in srgb,var(--g7) 35%,var(--line));border-radius:14px;background:var(--surface);box-shadow:0 1px 2px rgba(20,30,50,.06);cursor:pointer;color:var(--ink);text-align:left;font:inherit;font-weight:600;transition:border-color .15s,color .15s}
.phone-cta:hover,.phone-cta:focus-visible{border-color:var(--g7);box-shadow:0 4px 12px -6px rgba(20,30,50,.3)}
.phone-cta .ic{display:grid;place-items:center;width:40px;height:40px;color:var(--g7)}.phone-cta svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.phone-cta .tx{display:grid;line-height:1.25}.phone-cta b{font-size:.95rem}.phone-cta small{font-size:.78rem;font-weight:500;color:var(--muted)}
.phonebtn{display:grid;place-items:center;width:44px;height:44px;border:0;background:none;color:var(--muted);cursor:pointer;padding:0;margin-left:4px}.phonebtn:hover,.phonebtn:focus-visible{color:var(--g7)}.phonebtn[data-post]:hover,.phonebtn[data-post]:focus-visible{color:var(--bad)}
.phonebtn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
dialog.pdlg{border:0;border-radius:18px;padding:0;width:min(420px,92vw);background:var(--surface);color:var(--ink);box-shadow:0 24px 60px -12px rgba(10,20,40,.55)}
dialog.pdlg::backdrop{background:rgba(10,18,32,.5);backdrop-filter:blur(2px)}
.pdlg .pbody{display:grid;gap:16px;padding:22px 22px 24px}.pdlg header{display:flex;justify-content:space-between;align-items:start;gap:12px}.pdlg h2{font-size:1.2rem}
.pdlg .x{width:44px;height:44px;margin:-8px -10px 0 0;border:0;background:none;color:var(--muted);font-size:1.6rem;line-height:1;cursor:pointer}.pdlg .x:hover{color:var(--ink)}
.alt summary{font-size:.9rem;color:var(--muted);font-weight:600}.alt a{color:var(--g7)}
.qr{width:200px;height:200px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px var(--line);background:#fff}.qr svg{width:100%;height:100%;display:block}
code{font:600 1.05rem ui-monospace,Consolas,monospace;word-break:break-all}.peer{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)}.warn{background:#f7e5bf;color:#6b4a06;border-radius:12px;padding:12px 14px;font-size:.92rem}

.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(10px);border-bottom:0;box-shadow:0 1px 0 var(--line),0 8px 18px -12px rgba(20,30,50,.35)}
.top .in{max-width:880px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap}
.brand{display:flex;gap:10px;align-items:center;font:700 1.15rem system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);text-decoration:none}
.brand .logo .core{fill:var(--g7);stroke:none}.brand .logo .face{fill:var(--g7);fill-opacity:.16;stroke:none}.brand .logo{width:38px;height:38px;flex:none;fill:none;stroke:var(--g7);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.page-head{display:grid;gap:6px}.page-head p{max-width:60ch}
.tile .foot{display:flex;gap:4px;border-top:1px solid var(--line);padding-top:8px;margin:2px -4px 0}
.link{background:none;border:0;color:var(--muted);font:inherit;font-size:.82rem;padding:6px 8px;border-radius:8px;cursor:pointer;text-decoration:none}.link:hover{background:var(--g1);color:var(--ink)}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:12px;counter-reset:s}
.steps>li{display:grid;grid-template-columns:30px 1fr;gap:12px;align-items:start;counter-increment:s}
.steps>li::before{content:counter(s);width:30px;height:30px;border-radius:50%;background:var(--g1);color:var(--g7);font-weight:700;display:grid;place-items:center}
.cards2{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.choice{background:var(--surface);border-radius:18px;box-shadow:0 0 0 1px var(--line);padding:16px;display:grid;gap:6px;text-decoration:none;color:var(--ink);align-content:start}
.choice:hover{box-shadow:0 0 0 2px var(--g7)}.choice h3{margin:0;font:700 1.05rem system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.kicker{font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--g7)}
.panel h2+.muted{margin-top:-6px}
.swatches{display:flex;flex-wrap:wrap;gap:10px}.sw{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 8px;border-radius:999px;background:var(--surface);border:0;box-shadow:inset 0 0 0 1px var(--line);color:var(--ink);font:inherit;font-weight:600;cursor:pointer}.sw i{width:26px;height:26px;border-radius:50%;display:block}.sw[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--g7)}
.drop{display:grid;gap:4px;justify-items:center;text-align:center;padding:26px 16px;border:2px dashed var(--line);border-radius:14px;cursor:pointer;background:var(--g1)}
.drop:hover,.drop.over,.drop:focus-visible{border-color:var(--g7);outline:0}
.field{display:grid;gap:3px;font-size:.85rem}.field input{min-height:42px;border-radius:9px;border:1px solid var(--line);padding:0 10px;font:inherit;background:var(--surface);color:var(--ink)}
progress{accent-color:var(--g7);height:10px}
.statline{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}


.skip{position:absolute;left:-9999px;top:8px;background:var(--g7);color:#fff;padding:9px 16px;border-radius:10px;z-index:50;font-weight:600;text-decoration:none}.skip:focus{left:8px}
.nav{display:flex;gap:4px;margin-left:auto}
.nav a{position:relative;display:flex;align-items:center;gap:8px;padding:18px 14px;text-decoration:none;color:var(--muted);font-weight:600;font-size:.92rem;white-space:nowrap;border-bottom:3px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s}
.nav a svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nav a:hover{color:var(--ink)}.nav a[aria-current=page]{color:var(--g7);border-bottom-color:var(--g7)}
.nav .dot{position:absolute;top:12px;right:4px;width:8px;height:8px;border-radius:50%;background:var(--bad)}
@media(max-width:700px){
  .top{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--bg)} /* un filtre sur le parent casserait position:fixed de la barre du bas */
  .nav{position:fixed;left:0;right:0;bottom:0;margin:0;border-radius:0;padding:0 0 env(safe-area-inset-bottom);background:color-mix(in srgb,var(--surface) 95%,transparent);backdrop-filter:blur(14px);box-shadow:0 -1px 0 var(--line),0 -8px 18px -12px rgba(20,30,50,.35);z-index:30;gap:0}
  .nav a{flex:1;flex-direction:column;gap:3px;padding:9px 4px 7px;font-size:.74rem;border-bottom:0;border-top:3px solid transparent;margin:0;justify-content:center}
  .nav a svg{width:24px;height:24px}
  .phonebtn{margin-left:auto}
  .nav a[aria-current=page]{border-top-color:var(--g7)}
  .nav .dot{top:8px;right:calc(50% - 22px)}
  body:has(.nav){padding-bottom:calc(76px + env(safe-area-inset-bottom))}
}
[hidden]{display:none!important}
a:focus-visible,button:focus-visible,summary:focus-visible,.drop:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid color-mix(in srgb,var(--g7) 50%,transparent);outline-offset:2px}
.head-row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px 20px;flex-wrap:wrap}
.tile{transition:box-shadow .15s,transform .15s}.tile:hover{box-shadow:0 0 0 1px var(--g7),0 10px 26px -14px rgba(0,0,0,.3)}
.tile header{align-items:flex-start}.tile h3 a{color:inherit;text-decoration:none}.tile h3 a:hover{text-decoration:underline}
.tile-add{border:2px dashed var(--line);background:transparent;box-shadow:none;display:grid;place-items:center;align-content:center;text-align:center;min-height:170px;color:var(--muted);text-decoration:none;gap:8px;border-radius:18px;padding:16px;font-weight:600;transition:border-color .15s,color .15s}
.offl{display:flex;align-items:center;gap:12px;background:var(--surface);box-shadow:0 0 0 1px var(--line);padding:14px 16px;border-radius:14px;text-decoration:none;color:var(--ink)}.offl .ic{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--g1);color:var(--g7);flex:none}.offl .ic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.offl b{display:block}.offl small{color:var(--muted);font-size:.85rem}
.vers{display:flex;flex-wrap:wrap;gap:6px;margin:0}.vers span{background:var(--g1);color:var(--muted);border-radius:999px;padding:2px 9px;font-size:.78rem;font-variant-numeric:tabular-nums}
.lk-card{padding:8px 8px 14px;background:radial-gradient(circle at 50% 46%,color-mix(in srgb,var(--g1) 70%,var(--surface)),var(--surface) 72%)}.lk-svg{width:100%;height:auto;display:block}
.lk-e{fill:none;stroke:var(--g7);stroke-opacity:.6;stroke-width:1.8;stroke-dasharray:5 6;stroke-linecap:round;animation:lk-flow 1s linear infinite}.lk-e.off{stroke-dasharray:none;animation:none}
@keyframes lk-flow{to{stroke-dashoffset:-11}}
.lk-halo{fill:var(--g1)}.lk-ring{fill:var(--g1);stroke:var(--g7);stroke-opacity:.55;stroke-width:1.5}.lk-n.on .lk-ring{stroke-opacity:1}.lk-n.miss .lk-ring{fill:#fdecea;stroke:#d5473d}.lk-n.ext .lk-ring{stroke-dasharray:none}
.lk-n.core .lk-ring{fill:var(--g8);stroke:none}.lk-in{fill:var(--surface)}.lk-ini{fill:var(--g7);font-weight:700;font-family:system-ui,sans-serif}.lk-lb{fill:var(--ink);font:600 12.5px system-ui,sans-serif;paint-order:stroke;stroke:var(--surface);stroke-width:6px;stroke-linejoin:round}
.lk-sep{stroke:var(--line);stroke-width:1}.lk-sl{fill:var(--muted);font:700 11px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;paint-order:stroke;stroke:var(--surface);stroke-width:8px}
.lk-cap{margin:0;text-align:center;font-size:.85rem}.lk-lone{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 8px 0}
@media (prefers-reduced-motion:reduce){.lk-e{animation:none}}
.lk-sec{display:grid;gap:6px}.lk-t{font-size:.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.chip{display:grid;gap:1px;background:var(--g1);border-radius:10px;padding:7px 11px}.chip a{color:inherit;text-decoration:none}.chip a:hover{text-decoration:underline}.chip small{color:var(--muted);font-size:.8rem}.lk-note{margin:0;font-size:.9rem}
.tile-add:hover{border-color:var(--g7);color:var(--g7)}.tile-add .plus{width:44px;height:44px;border-radius:50%;background:var(--g1);color:var(--g7);display:grid;place-items:center;font-size:1.7rem;line-height:1}
.more{position:relative;margin-left:auto;flex:none}.more>summary{list-style:none;cursor:pointer;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:var(--muted);font-size:1.2rem;line-height:1}
.more>summary::-webkit-details-marker{display:none}.more>summary:hover,.more[open]>summary{background:var(--g1);color:var(--ink)}
.menu{position:absolute;right:0;top:38px;z-index:4;background:var(--surface);border-radius:12px;box-shadow:0 0 0 1px var(--line),0 14px 30px -10px rgba(0,0,0,.4);padding:6px;display:grid;min-width:11rem}
.menu a,.menu button{text-align:left;background:none;border:0;padding:10px 12px;border-radius:8px;color:var(--ink);font:inherit;font-size:.9rem;cursor:pointer;text-decoration:none}.menu a:hover,.menu button:hover{background:var(--g1)}

.stepper{display:flex;gap:6px 10px;list-style:none;margin:0;padding:0;flex-wrap:wrap;align-items:center}.stepper li{display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:600;font-size:.9rem}
.stepper li b{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--g1);color:var(--g7);font-size:.85rem}
.stepper li[aria-current=step]{color:var(--ink)}.stepper li[aria-current=step] b,.stepper li.done b{background:var(--g7);color:#fff}
.stepper li+li::before{content:"";width:22px;height:2px;background:var(--line);margin-right:2px}
.kinds{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.kind{background:var(--g1);border-radius:14px;padding:12px 14px;display:grid;gap:3px;font-size:.9rem;align-content:start}.kind strong{font-size:.95rem}
.phases{list-style:none;margin:0;padding:0;display:grid;gap:12px}.phases li{display:flex;align-items:center;gap:12px;color:var(--muted)}
.phases li i{width:24px;height:24px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--line);display:grid;place-items:center;font-style:normal;font-size:.8rem;flex:none}
.phases li.now{color:var(--ink);font-weight:600}.phases li.now i{box-shadow:inset 0 0 0 2px var(--g7);animation:pulse 1.4s infinite}.phases li.ok i{background:var(--g7);color:#fff;box-shadow:none}
@keyframes pulse{50%{box-shadow:inset 0 0 0 2px var(--g7),0 0 0 5px color-mix(in srgb,var(--g7) 22%,transparent)}}
.chip{display:inline-flex;gap:6px;align-items:center;background:var(--g1);color:var(--g8);border-radius:999px;padding:3px 11px;font-size:.82rem;font-weight:600}
.summary-card{display:flex;gap:14px;align-items:center}.summary-card .ph{width:56px;height:56px;font-size:1.5rem}
.facts{display:flex;flex-wrap:wrap;gap:6px}.ok-panel{justify-items:center;text-align:center;padding:30px 18px}.big-ok{width:56px;height:56px;border-radius:50%;background:var(--g7);color:#fff;display:grid;place-items:center;font-size:1.8rem}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
details summary{cursor:pointer;font-weight:600}pre{background:var(--g1);padding:12px;border-radius:10px;overflow:auto;font-size:.8rem;max-height:340px;margin:0}
`;

function layout(title, body, extraHead = "") {
  return `<!doctype html><html lang="fr" data-theme="${currentTheme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="${THEMES[currentTheme].color}"><link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/hub/icon-192.png"><link rel="apple-touch-icon" href="/hub/icon-192.png"><style>${CSS}</style>${extraHead}</head><body>${body}</body></html>`;
}

const SIC = {
  drive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M5.5 14l2-8.5A2 2 0 0 1 9.4 4h5.2a2 2 0 0 1 1.9 1.5l2 8.5"/><path d="M7 17h.01M11 17h4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  pc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  pcs: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="12" height="9" rx="1.8"/><path d="M6 18h5M8.5 14v4"/><rect x="15.5" y="9" width="6" height="10" rx="1.6"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6z"/><path d="M12 8v4.5M12 15.5v.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

function dataPanel(o) {
  const d = o.data;
  const win = d.platform === "win32";
  const drives = d.candidates.length
    ? `<div class="drives" role="group" aria-label="Disques proposés">${d.candidates.map((c) => `<button type="button" class="drive" data-dir="${esc(c.dir)}" title="${esc(c.dir)}"><span class="di">${SIC.drive}</span><span class="dt"><b>${esc(c.label)}</b><small>${esc(c.dir)}</small></span><span class="dck">${SIC.check}</span></button>`).join("")}</div>`
    : `<p class="hint">Aucun disque commun détecté.${win ? "" : " Ouvrez le disque Windows ou le disque de données dans le gestionnaire de fichiers pour le monter, puis rechargez cette page."}</p>`;
  return `<section class="panel" id="donnees" role="tabpanel" aria-labelledby="tab-donnees">
<div class="stat ${d.problem ? "bad" : d.isDefault ? "" : "ok"}"><span class="si">${SIC.folder}</span><div class="sx"><span class="muted">Dossier de données actuel</span><code>${esc(d.dir)}</code></div>
<span class="badge ${d.problem ? "bad" : d.isDefault ? "wait" : "ok"}">${d.problem ? "Problème" : d.isDefault ? "Ce système seulement" : "Partagé"}</span></div>
${d.problem ? `<p class="warn">${esc(d.problem)} <button class="btn small" data-post="/hub/data/retry" data-busy="Vérification…">Réessayer</button></p>` : ""}
<p class="muted">Ce PC démarre tantôt sous Windows, tantôt sous Ubuntu ? Faites-leur lire <strong>le même dossier</strong> : une plante créée sous l'un apparaît sous l'autre. Vos données actuelles y sont copiées, rien n'est effacé.</p>
<ol class="steps3">
<li><div class="sh"><span class="n">1</span><strong>Choisissez un disque commun</strong></div>${drives}</li>
<li><div class="sh"><span class="n">2</span><strong>Ou indiquez un autre dossier</strong></div>
<form id="dataform"><span class="filefield"><input name="dir" placeholder="${win ? "D:\\\\data" : "/media/vous/Donnees/data"}" aria-label="Chemin du dossier"><button type="button" id="pickbtn">Parcourir…</button></span>
<div class="row" style="margin-top:10px"><button class="btn" id="usebtn">Utiliser ce dossier</button><button type="button" class="btn quiet small" id="browsebtn" hidden style="display:none">Le sélecteur ne s'ouvre pas ? Parcourir ici</button></div></form></li>
</ol>
<div id="browser" style="display:none;border:1px solid var(--line);border-radius:12px;padding:10px;gap:8px">
<div id="bpath" style="font-size:.9rem;word-break:break-all"></div>
<div class="row"><button type="button" class="btn quiet small" id="bup">↑ Dossier parent</button>
<button type="button" class="btn small" id="bchoose">Utiliser ce dossier</button></div>
<div id="blist" style="display:grid;gap:4px;max-height:16rem;overflow:auto"></div>
<form id="bnew" class="row" style="align-items:end"><label style="display:grid;gap:3px;font-size:.85rem;flex:1;min-width:10rem">Créer un dossier ici (ex. Triviae - Données)
<input name="n" style="min-height:38px;border-radius:9px;border:1px solid var(--line);padding:0 10px;font:inherit;background:var(--surface);color:var(--ink)"></label>
<button class="btn quiet small">Créer</button></form>
<p id="bmsg" class="warn" style="display:none"></p></div>
<p id="datamsg" class="warn" style="display:none"></p>
${d.isDefault ? "" : `<div><button class="btn quiet small" data-dir-reset="1">Revenir au dossier de ce système</button></div>`}
<details class="help"><summary>À savoir</summary><p class="muted">${win ? "Côté Ubuntu, ce disque apparaît sous /media/… ou /mnt/… : refaites ce réglage là-bas avec ce même disque. " : "Côté Windows, le même disque porte une lettre (C:, D:…) : refaites ce réglage là-bas avec ce même disque. "}Choisissez <strong>sur les deux systèmes</strong> un dossier du <strong>même disque</strong> (un disque ou une partition NTFS). Pour que Ubuntu puisse <em>écrire</em> sur un disque NTFS, désactivez le « démarrage rapide » de Windows (Panneau de configuration &gt; Options d'alimentation &gt; Choisir l'action des boutons d'alimentation) et éteignez complètement Windows avant de démarrer Ubuntu.</p></details>
</section>`;
}

function syncPanel(o) {
  const st = o.sync;
  const when = (t) => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const peers = st.peers.length
    ? `<div class="peers">${st.peers
        .map((p) => {
          const ls = p.lastSync;
          const state = ls ? `${ls.ok ? "✓" : "✗"} ${esc(ls.message)} · ${when(ls.at)}` : "pas encore synchronisé";
          return `<div class="peercard"><span class="si">${SIC.pc}</span><div class="sx"><strong>${esc(p.name)}</strong> <span class="pill ${p.online ? "ok" : "bad"}">${p.online ? "en ligne" : "hors ligne"}</span><span class="muted">${state}</span></div>
<span class="row"><button class="btn small" data-post="/hub/sync/now/${esc(p.id)}" data-busy="Synchronisation…">Synchroniser</button>
<button class="btn quiet small" data-post="/hub/sync/unpair/${esc(p.id)}" data-confirm="Retirer ${esc(p.name)} ? Les données déjà synchronisées restent sur les deux PC.">Retirer</button></span></div>`;
        })
        .join("")}</div>`
    : `<div class="empty"><span class="si">${SIC.pcs}</span><div><strong>Aucun autre PC jumelé</strong><p class="muted" style="margin:2px 0 0">Jumelez votre PC portable ou fixe ci-dessous : vos données se fusionnent dès qu'ils sont sur le même Wi-Fi.</p></div></div>`;

  const addr = esc((o.addresses[0] ? o.addresses[0].ip : "ce PC") + ":" + o.port);
  const code = st.pairing
    ? `<div class="bigcode"><span class="muted">Sur l'autre PC, saisissez :</span><div class="kv"><span>Adresse</span><code>${addr}</code></div><div class="kv"><span>Code</span><code class="num">${esc(st.pairing.code)}</code></div>
<p class="muted" style="margin:0;font-size:.85rem">Valable ${Math.ceil(st.pairing.expiresInSec / 60)} min, un seul usage.</p><div><button class="btn quiet small" data-post="/hub/sync/pair/cancel">Annuler</button></div></div>`
    : `<button class="btn" data-post="/hub/sync/pair/start">Afficher un code</button>`;

  return `<section class="panel" id="sync" role="tabpanel" aria-labelledby="tab-sync">
<div class="stat"><span class="si">${SIC.pc}</span><div class="sx"><span class="muted">Ce PC s'appelle</span><strong style="font-size:1.1rem">${esc(st.name)}</strong></div>
<button class="switch ${st.auto ? "on" : ""}" role="switch" aria-checked="${st.auto ? "true" : "false"}" data-post-json="/hub/sync/auto" data-on="${st.auto ? "0" : "1"}"><span class="knob"></span><span class="sl">Synchronisation automatique</span></button></div>
<p class="muted">Vos plantes, semis et photos sont fusionnés avec l'autre PC (Windows ou Ubuntu) dès qu'il est sur le Wi-Fi de la maison, puis toutes les 5 minutes.</p>
${peers}
<div><h2 style="font-size:1.05rem;margin:0 0 4px">Jumeler un autre PC</h2><p class="muted" style="margin:0">Un code à 8 chiffres suffit. Choisissez de quel côté il s'affiche.</p></div>
<div class="opts2">
<div class="opt"><span class="oi">${SIC.code}</span><strong>Afficher un code ici</strong><p class="muted">L'autre PC le saisit.</p>${code}</div>
<div class="opt"><span class="oi">${SIC.key}</span><strong>Saisir un code</strong><p class="muted">L'autre PC affiche un code.</p>
<form id="joinform" style="display:grid;gap:8px">
<label class="fl">Adresse de l'autre PC<input name="address" placeholder="192.168.1.20:8080" required></label>
<label class="fl">Code à 8 chiffres<input name="code" inputmode="numeric" placeholder="1234 5678" required></label>
<button class="btn">Jumeler</button></form><p id="joinmsg" class="warn" style="display:none;margin:0"></p></div>
</div>
<details class="help"><summary>À savoir</summary><p class="muted">Les deux PC doivent avoir la même heure (réglage automatique de l'heure). Les échanges sont signés : il faut un jumelage pour y accéder.</p></details>
</section>`;
}

function tile(rec, local) {
  const { def } = rec;
  const [label, tone] = STATUS[rec.status] || STATUS.stopped;
  const icon = def.icon ? `<img src="${esc(def.basePath + def.icon)}" alt="" onerror="var s=document.createElement('span');s.className='ph';s.textContent=this.dataset.l;this.replaceWith(s)" data-l="${esc(def.name.slice(0, 1).toUpperCase())}">` : `<span class="ph">${esc(def.name.slice(0, 1).toUpperCase())}</span>`;
  const href = esc(def.basePath + (def.actions[0].path === "/" ? "" : def.actions[0].path));
  const actions = def.actions
    .map((a, i) => `<a class="btn${i ? " quiet" : ""}" href="${esc(def.basePath + (a.path === "/" ? "" : a.path))}">${esc(a.label)}</a>`)
    .join("");
  const more = local
    ? `<details class="more"><summary aria-label="Plus d'actions pour ${esc(def.name)}" title="Plus d'actions">⋯</summary><div class="menu">
<a href="/hub/log/${esc(def.id)}">Voir le journal</a>
<button data-post="/hub/restart/${esc(def.id)}" data-busy="Redémarrage…">Redémarrer</button>
<a href="/reglages#${esc(def.id)}">Réglages</a></div></details>`
    : "";
  const inf = def.info || { tech: [] };
  const vers = inf.version ? ["v" + inf.version] : [];
  const verLine = vers.length ? `<p class="vers">${vers.map((v) => `<span>${esc(v)}</span>`).join("")}</p>` : "";
  return `<li class="tile"><header>${icon}<div><h3><a href="${href}">${esc(def.name)}</a></h3><span class="pill ${tone}" data-app="${esc(def.id)}">${esc(label)}</span></div>${more}</header>${verLine}
${def.description ? `<p class="muted">${esc(def.description)}</p>` : ""}<div class="row">${actions}</div></li>`;
}

/** Barre du haut + navigation. Les onglets d'administration n'existent que vus depuis le PC. */
const ICONS = {
  apps: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></svg>',
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.5l1.7-2"/><path d="M20 20v-4.5h-4.5"/></svg>',
  links: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.6"/><circle cx="18" cy="7" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M8.6 7h6.8"/><path d="M7.3 9.3l3.4 6.4"/><path d="M16.7 9.3l-3.4 6.4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/></svg>',
};

/** Barre du haut + navigation. Les onglets d'administration n'existent que vus depuis le PC. */
const phoneDialog = (o) => {
  if (!o.local) return "";
  const body = o.qrSvg
    ? `<div class="qrbox"><div class="qr" role="img" aria-label="QR code de ${esc(o.selected)}">${o.qrSvg}</div><span class="qrcap">Scannez avec l'appareil photo</span></div>
<ol class="steps"><li><span><b>Scannez</b> le code, ou tapez l'adresse ci-dessous dans Chrome.</span></li><li><span>Menu <b>⋮</b> → <b>Ajouter à l'écran d'accueil</b> : chaque application garde son icône.</span></li><li><span>Sans le PC ? Sur le téléphone, touchez <b>Copie sur le téléphone</b> pour garder une copie hors ligne.</span></li></ol>
<div class="addr"><code id="addr">${esc(o.selected)}</code><button class="btn quiet small" data-copy="${esc(o.selected)}" data-target="addr">Copier</button></div>
${o.addresses.length > 1 ? `<details class="alt"><summary>Ça ne marche pas ?</summary><p class="muted" style="margin:6px 0 0;font-size:.9rem">Essayez l'autre adresse du PC : ${o.addresses.filter((a) => a.url !== o.selected).map((a) => `<a href="${esc(o.path || "/")}?ip=${esc(a.ip)}">${esc(a.url)}</a>`).join(" · ")}</p></details>` : ""}`
    : `<p class="warn">Aucun réseau local détecté. Connectez le PC au Wi-Fi ou au câble de la box, puis rechargez la page.</p>`;
  return `<dialog class="pdlg" id="phonedlg" aria-labelledby="tel"><div class="pbody"><header><div><span class="kicker">Téléphone</span><h2 id="tel">Ouvrir sur le téléphone</h2><p class="muted" style="margin:4px 0 0">Le téléphone doit être sur le même Wi-Fi que ce PC.</p></div><button class="x" type="button" aria-label="Fermer" data-close>×</button></header>${body}</div></dialog>`;
};
const QUIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M6.8 6.6a8 8 0 1 0 10.4 0"/></svg>';
const PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></svg>';
const PHONE_SCRIPT = `<script>
(function(){const d=document.getElementById('phonedlg'),o=document.getElementById('phoneopen');if(!d||!o)return;
o.addEventListener('click',()=>{if(d.showModal)d.showModal();else d.setAttribute('open','')});
d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))d.close()})})();
</script>`;

function shell(o, active, inner, extraScript = "") {
  // Pastille rouge sur un onglet quand quelque chose demande l'attention (dossier de données introuvable, pare-feu refusé).
  const alert = { sync: !!(o.data && o.data.problem), settings: !!(o.setup && o.setup.firewall === "declined") };
  const tabs = [
    ["apps", "/", "Applications"],
    ["links", "/liens", "Liens"],
    ["sync", "/synchronisation", "Synchro"],
    ["settings", "/reglages", "Réglages"],
  ];
  const full = { links: "Liens entre applications", apps: "Applications", sync: "Synchronisation", settings: "Réglages" };
  const nav = o.local
    ? `<nav class="nav" aria-label="Navigation principale">${tabs
        .map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""} aria-label="${full[k]}${alert[k] ? " (à vérifier)" : ""}">${ICONS[k]}<span class="lbl">${k === "sync" ? "Synchronisation" : label}</span>${alert[k] ? '<i class="dot" aria-hidden="true"></i>' : ""}</a>`)
        .join("")}</nav>`
    : "";
  return layout(
    PAGE_TITLES[active],
    `<a class="skip" href="#contenu">Aller au contenu</a><header class="top"><div class="in"><a class="brand" href="/"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><circle class="face" cx="12" cy="13" r="3.2"/><circle class="face" cx="12" cy="4.2" r="2.2"/><circle class="face" cx="19.6" cy="17.4" r="2.2"/><circle class="face" cx="4.4" cy="17.4" r="2.2"/><path d="M12 9.8V6.4"/><path d="M14.8 14.6l2.9 1.7"/><path d="M9.2 14.6l-2.9 1.7"/><circle cx="12" cy="13" r="3.2"/><circle cx="12" cy="4.2" r="2.2"/><circle cx="19.6" cy="17.4" r="2.2"/><circle cx="4.4" cy="17.4" r="2.2"/><circle class="core" cx="12" cy="13" r="1.1"/></svg>Triviae</a>${nav}${o.local ? `<button class="phonebtn" type="button" data-post="/hub/quit" data-confirm="Arrêter Triviae ? Le téléphone ne pourra plus s'y connecter." aria-label="Quitter Triviae" title="Quitter Triviae">${QUIT_ICON}</button>` : ""}</div></header>
<main id="contenu">${inner}</main>${phoneDialog(o)}${SCRIPT}${PHONE_SCRIPT}${extraScript}`,
  );
}

const SCRIPT = `<script>
for(const b of document.querySelectorAll('[data-post]'))b.addEventListener('click',async()=>{
if(b.dataset.confirm&&!confirm(b.dataset.confirm))return;b.disabled=true;if(b.dataset.busy)b.textContent=b.dataset.busy;
try{const r=await fetch(b.dataset.post,{method:'POST'});if(b.dataset.done){const j=await r.json().catch(()=>({}));b.textContent=j.ok?b.dataset.done:(b.dataset.fail||'Échec');return setTimeout(()=>location.reload(),2500)}}catch(e){}
setTimeout(()=>location.reload(),b.dataset.post==='/hub/quit'?500:1200)});
for(const b of document.querySelectorAll('[data-post-json]'))b.addEventListener('click',async()=>{b.disabled=true;
try{await fetch(b.dataset.postJson,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({on:b.dataset.on==='1'})})}catch(e){}
location.reload()});
const jf=document.getElementById('joinform');
if(jf)jf.addEventListener('submit',async(e)=>{e.preventDefault();const m=document.getElementById('joinmsg'),btn=jf.querySelector('button');
btn.disabled=true;m.style.display='none';
try{const r=await fetch('/hub/sync/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:jf.address.value,code:jf.code.value})});
const j=await r.json();if(j.ok){m.textContent='PC jumelé : '+j.peer.name+'. Première synchronisation en cours…';m.style.display='block';
fetch('/hub/sync/now/'+j.peer.id,{method:'POST'}).finally(()=>location.reload())}else{m.textContent=j.message||'Échec du jumelage.';m.style.display='block';btn.disabled=false}}
catch(err){m.textContent='Échec du jumelage.';m.style.display='block';btn.disabled=false}});
async function setDir(dir){const m=document.getElementById('datamsg');m.style.display='block';m.textContent='Copie et redémarrage des applications…';
try{const r=await fetch('/hub/data/set',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dir:dir})});const j=await r.json().catch(()=>({message:'Erreur '+r.status+' du serveur (voir le fichier hub.log).'}));
if(j.ok){m.textContent='Dossier changé.'+(j.copied&&j.copied.length?' Données copiées : '+j.copied.join(', ')+'.':'')+(j.kept&&j.kept.length?' Ce dossier contenait déjà des données ('+j.kept.join(', ')+') : elles sont utilisées telles quelles, celles de ce système ne sont pas copiées par-dessus.':'');setTimeout(()=>location.reload(),j.kept&&j.kept.length?5000:1500)}
else m.textContent=j.message||'Échec.'}catch(e){m.textContent='Échec.'}}
for(const b of document.querySelectorAll('[data-dir]:not(.drive)'))b.addEventListener('click',()=>setDir(b.dataset.dir));
const dr=document.querySelector('[data-dir-reset]');if(dr)dr.addEventListener('click',()=>setDir(null));
const df=document.getElementById('dataform');if(df)df.addEventListener('submit',(e)=>{e.preventDefault();if(df.dir.value.trim())setDir(df.dir.value)});
(function(){const bb=document.getElementById('browsebtn');if(!bb)return;
const pk=document.getElementById('pickbtn');if(pk)pk.addEventListener('click',async()=>{pk.disabled=true;pk.textContent='Sélection…';const dm=document.getElementById('datamsg');dm.style.display='none';
try{const r=await fetch('/hub/data/pick',{method:'POST'});const j=await r.json();if(j.path){document.getElementById('dataform').dir.value=j.path}else if(j.unavailable){dm.textContent='Le sélecteur de dossiers du système n\\'est pas disponible ici : utilisez le navigateur de dossiers ci-dessous.';dm.style.display='block';bb.click()}}catch(e){bb.click()}pk.disabled=false;pk.textContent='Parcourir…'});
const box=document.getElementById('browser'),bl=document.getElementById('blist'),bp=document.getElementById('bpath'),bm=document.getElementById('bmsg');
let cur='',par=null,can=false;
function msg(t){bm.textContent=t||'';bm.style.display=t?'block':'none'}
async function go(dir){msg('');try{const r=await fetch('/hub/data/browse?dir='+encodeURIComponent(dir||''),{cache:'no-store'});const j=await r.json();
if(!j.ok){msg(j.message);return}cur=j.dir;par=j.parent;can=j.canChoose;
bp.textContent=cur?cur:'Choisissez un disque ou un dossier de départ';
document.getElementById('bup').style.display=par===null?'none':'';document.getElementById('bchoose').style.display=can?'':'none';
document.getElementById('bnew').style.display=can?'':'none';bl.textContent='';
if(!j.entries.length){const e=document.createElement('p');e.className='muted';e.textContent='Aucun sous-dossier ici.';bl.appendChild(e)}
for(const x of j.entries){const b=document.createElement('button');b.type='button';b.className='btn quiet small';b.style.justifyContent='flex-start';b.textContent='📁 '+x.name;b.title=x.dir;b.addEventListener('click',()=>go(x.dir));bl.appendChild(b)}}
catch(e){msg('Échec du chargement.')}}
bb.addEventListener('click',()=>{box.style.display='grid';go(cur)});
document.getElementById('bup').addEventListener('click',()=>go(par));
document.getElementById('bchoose').addEventListener('click',()=>{if(cur)setDir(cur)});
document.getElementById('bnew').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target,n=f.n.value;if(!n.trim())return;
try{const r=await fetch('/hub/data/mkdir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({parent:cur,name:n})});const j=await r.json();
if(j.ok){f.n.value='';go(j.dir)}else msg(j.message)}catch(e){msg('Échec.')}});})();
for(const b of document.querySelectorAll('button[data-theme]'))b.addEventListener('click',async()=>{try{await fetch('/hub/theme',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({theme:b.dataset.theme})})}catch(e){}location.reload()});
for(const b of document.querySelectorAll('[data-storage]'))b.addEventListener('click',async()=>{b.disabled=true;try{await fetch('/hub/storage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:b.dataset.storage,on:b.dataset.on==='1'})})}catch(e){}location.reload()});
for(const b of document.querySelectorAll('[data-copy]'))b.addEventListener('click',async()=>{const t=b.dataset.copy,old=b.textContent;
try{await navigator.clipboard.writeText(t);b.textContent='Copié ✓'}catch(e){const r=document.createRange(),n=document.getElementById(b.dataset.target);if(n){r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r)}b.textContent='Sélectionné : Ctrl+C'}
setTimeout(()=>b.textContent=old,2000)});
document.addEventListener('click',(e)=>{for(const d of document.querySelectorAll('details.more[open]'))if(!d.contains(e.target))d.open=false});
async function poll(){try{const r=await (await fetch('/hub/status',{cache:'no-store'})).json();
for(const a of r){const el=document.querySelector('[data-app="'+a.id+'"]');if(el){el.textContent=a.label;el.className='pill '+a.tone}}}catch(e){}}
setInterval(poll,3000);</script>`;

const PAGE_TITLES = { links: "Liens entre applications", apps: "Triviae", sync: "Synchronisation", settings: "Réglages", import: "Ajouter une application" };

/** Page « Liens » : quelles applications échangent des données entre elles. */
function linksPage(o) {
  const L = o.links || { nodes: [], edges: [], missing: [] };
  const byId = Object.fromEntries(L.nodes.map((n) => [n.id, n]));
  const nm = (id) => (byId[id] ? byId[id].name : id);
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // Schéma en étoile : l'application la plus liée au centre, les autres autour, pointillés animés du fournisseur vers le receveur.
  const deg = {};
  for (const e of L.edges) for (const id of [e.from, e.to]) deg[id] = (deg[id] || 0) + 1;
  const linked = L.nodes.filter((nd) => deg[nd.id]);
  const lone = L.nodes.filter((nd) => !deg[nd.id] && nd.status !== "missing" && nd.status !== "external");
  const centerNode = [...linked].sort((a, b) => deg[b.id] - deg[a.id] || a.name.localeCompare(b.name))[0];
  const around = linked.filter((nd) => nd !== centerNode);
  const W = 640, cx = W / 2;
  const R = around.length > 8 ? 150 : 128;
  const starH = centerNode ? 2 * (R + 62) : 0;
  const PER = 6, ROW = 96;
  const loneRows = Math.ceil(lone.length / PER);
  const H = starH + (lone.length ? (centerNode ? 36 : 14) + loneRows * ROW : 0);
  const cy = starH / 2;
  const pos = {};
  if (centerNode) {
    pos[centerNode.id] = { x: cx, y: cy, r: 44 };
    around.forEach((nd, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / around.length;
      pos[nd.id] = { x: cx + Math.cos(a) * R * 1.5, y: cy + Math.sin(a) * R, r: 30 };
    });
  }
  lone.forEach((nd, i) => {
    const row = Math.floor(i / PER), inRow = Math.min(PER, lone.length - row * PER), k = i % PER;
    pos[nd.id] = { x: cx + (k - (inRow - 1) / 2) * 104, y: starH + (centerNode ? 36 : 14) + row * ROW + 36, r: 30 };
  });
  const logo = (nd, p, i) => {
    const url = nd.icon && nd.basePath ? nd.basePath + nd.icon : "";
    const ring = nd.status === "missing" ? "miss" : nd.status === "external" ? "ext" : nd.status === "running" ? "on" : "";
    const ir = p.r - 6;
    const inner = url
      ? `<clipPath id="lk-c${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${ir}"/></clipPath><circle class="lk-in" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${ir}"/><image href="${esc(url)}" x="${(p.x - ir).toFixed(1)}" y="${(p.y - ir).toFixed(1)}" width="${ir * 2}" height="${ir * 2}" clip-path="url(#lk-c${i})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle class="lk-in" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${ir}"/><text class="lk-ini" x="${p.x.toFixed(1)}" y="${(p.y + (p.r > 40 ? 8 : 6)).toFixed(1)}" text-anchor="middle" style="font-size:${p.r > 40 ? 22 : 17}px">${esc((nd.name || "?").trim().slice(0, 1).toUpperCase())}</text>`;
    const halo = p.r > 40 ? `<circle class="lk-halo" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r + 12}"/>` : "";
    return `<g class="lk-n ${ring}${p.r > 40 ? " core" : ""}">${halo}<circle class="lk-ring" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r}"/>${inner}<text class="lk-lb" x="${p.x.toFixed(1)}" y="${(p.y + p.r + (p.r > 40 ? 28 : 17)).toFixed(1)}" text-anchor="middle">${esc(cut(nd.name, 20))}</text></g>`;
  };
  const edgePath = (a, b, bend, off = 0) => {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const ox = -uy * off, oy = ux * off;
    const x1 = a.x + ux * (a.r + 4) + ox, y1 = a.y + uy * (a.r + 4) + oy, x2 = b.x - ux * (b.r + 4) + ox, y2 = b.y - uy * (b.r + 4) + oy;
    if (!bend) return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    const mx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.55, my = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.55;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const edgeSvg = (e) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return "";
    const off = (byId[e.from] && byId[e.from].status === "missing") || (byId[e.to] && byId[e.to].status === "missing") ? " off" : ""; // application liée mais non installée : trait plein, sans mouvement
    const bend = a.r < 40 && b.r < 40; // entre deux satellites : courbe vers le centre pour ne pas croiser le schéma
    return e.both
      ? `<path class="lk-e${off}" d="${edgePath(a, b, bend, 3.5)}"/><path class="lk-e${off}" d="${edgePath(b, a, bend, 3.5)}"/>`
      : `<path class="lk-e${off}" d="${edgePath(a, b, bend)}"/>`;
  };
  const shown = [...(centerNode ? [centerNode] : []), ...around, ...lone];
  const sep = centerNode && lone.length ? `<line class="lk-sep" x1="40" x2="${W - 40}" y1="${starH + 14}" y2="${starH + 14}"/><text class="lk-sl" x="${cx}" y="${starH + 32}" text-anchor="middle">Sans lien</text>` : "";
  const diagram = shown.length
    ? `<svg class="lk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Schéma des liens entre applications">${L.edges.map(edgeSvg).join("")}${sep}${shown.map((nd, i) => logo(nd, pos[nd.id], i)).join("")}</svg>`
    : "";
  const loneRow = "";

  const badge = (nd) => (nd.status === "running" ? '<span class="badge ok">en ligne</span>' : nd.status === "missing" ? '<span class="badge bad">non installée</span>' : nd.status === "external" ? '<span class="badge">externe</span>' : '<span class="badge">arrêtée</span>');
  const chip = (id, labels) => {
    const nd = byId[id];
    const name = `<b>${esc(nm(id))}</b>`;
    const link = nd && nd.basePath && nd.status === "running" ? `<a href="${esc(nd.basePath)}/">${name}</a>` : name;
    return `<li class="chip">${link}${labels.length ? `<small>${esc(labels.join(" · "))}</small>` : ""}</li>`;
  };
  const rows = L.nodes
    .filter((nd) => nd.status !== "missing" && nd.status !== "external")
    .map((nd) => {
      const from = L.edges.filter((e) => (e.to === nd.id || (e.both && e.from === nd.id)) );
      const recv = L.edges.filter((e) => e.to === nd.id || (e.both && e.from === nd.id)).map((e) => ({ id: e.to === nd.id ? e.from : e.to, labels: e.labels }));
      const send = L.edges.filter((e) => e.from === nd.id || (e.both && e.to === nd.id)).map((e) => ({ id: e.from === nd.id ? e.to : e.from, labels: e.labels }));
      void from;
      const sec = (title, list) => (list.length ? `<div class="lk-sec"><span class="lk-t">${title}</span><ul class="chips">${list.map((x) => chip(x.id, x.labels)).join("")}</ul></div>` : "");
      const note =
        nd.state === "off"
          ? '<p class="muted lk-note">Application arrêtée : ses liens ne sont pas connus pour l\'instant.</p>'
          : nd.state === "last"
            ? '<p class="muted lk-note">Application arrêtée : derniers liens connus.</p>'
            : !recv.length && !send.length
              ? '<p class="muted lk-note">Aucun lien avec une autre application.</p>'
              : "";
      return `<article class="appcard"><div class="ah"><span class="ai" aria-hidden="true">${ICONS.apps}</span><div class="at"><strong>${esc(nd.name)}</strong></div>${badge(nd)}</div>${sec("Reçoit des données de", recv)}${sec("Envoie des données à", send)}${note}</article>`;
    })
    .join("");

  const warn = L.missing.length
    ? `<p class="warn">${L.missing.length > 1 ? "Ces applications sont liées mais ne sont pas installées" : "Cette application est liée mais n'est pas installée"} : ${L.missing.map((m) => `<b>${esc(m)}</b>`).join(", ")}. Importez-la, ou corrigez le lien dans l'application qui y fait référence.</p>`
    : "";
  const none = !L.edges.length
    ? `<div class="panel"><h2>Aucun lien pour l'instant</h2><p class="muted" style="margin:0">Une application déclare ses liens dans son <code>app.json</code> (<code>"links"</code>) ou par une route <code>/api/liens</code> : voir le guide « Ajouter une application », partie « Liens entre applications ». Elle doit être démarrée pour que ses liens apparaissent ici.</p></div>`
    : "";
  return shell(
    o,
    "links",
    `<div class="page-head"><h1>Liens entre applications</h1><p class="muted">Quelles applications échangent des données entre elles. Les pointillés en mouvement vont de l'application qui fournit vers celle qui reçoit.</p></div>
${warn}${diagram ? `<section class="panel lk-card">${diagram}<p class="muted lk-cap">Les pointillés avancent de l'application qui fournit vers celle qui reçoit.</p>${loneRow}</section>` : ""}${none}
<section class="panel" aria-labelledby="lkd"><h2 id="lkd">Détail par application</h2>${rows || '<p class="muted" style="margin:0">Aucune application installée.</p>'}</section>`,
  );
}

/** Page 1 : les applications et le téléphone. L'ajout d'une application a sa propre page (/importer). */
function home(o) {
  const addTile = o.local ? `<li><a class="tile-add" href="/importer"><span class="plus" aria-hidden="true">+</span>Ajouter une application</a></li>` : "";
  const tiles = o.apps.length
    ? `<ul class="tiles">${o.apps.map((r) => tile(r, o.local)).join("")}${addTile}</ul>`
    : `<div class="panel" style="justify-items:start"><h2>Aucune application pour l'instant</h2><p class="muted">Importez le .zip de votre projet Next.js ou Nuxt : il est installé et démarré automatiquement.</p>${o.local ? `<a class="btn" href="/importer">Ajouter une application</a>` : ""}</div>`;

  return shell(
    o,
    "apps",
    `<div class="head-row"><div class="page-head"><h1>${o.apps.length ? o.apps.length + (o.apps.length > 1 ? " applications" : " application") : "Aucune application"}</h1><p class="muted">Toutes vos applications sur ce PC, accessibles depuis le téléphone.</p></div>${o.local ? `<button class="phone-cta" id="phoneopen" type="button"><span class="ic">${PHONE_ICON}</span><span class="tx"><b>Ouvrir sur le téléphone</b><small>QR code · adresse</small></span></button>` : ""}</div>${tiles}${o.local ? "" : `<a class="offl" href="/hors-ligne"><span class="ic" aria-hidden="true">${PHONE_ICON}</span><span><b>Copie sur le téléphone</b><small>Utiliser les applications sans le PC</small></span></a>`}`,
  );
}

const IMPORT_SCRIPT = `<script>
(function(){
var $=function(i){return document.getElementById(i)};
var drop=$('imp-drop'),fileIn=$('imp-file'),bar=$('imp-bar'),state=$('imp-state'),form=$('imp-form'),msg=$('imp-msg'),log=$('imp-log');
var token=null,kind='',timer=null,upl=null;
var PHASES=['Préparation des fichiers','Outils et dépendances','Compilation','Installation et démarrage'];
function show(n){for(var i=1;i<=4;i++){var v=$('v'+i);if(v)v.hidden=(i!==n);}
for(var j=1;j<=3;j++){var s=$('st'+j);s.className=j<Math.min(n,4)?'done':'';if(j===Math.min(n,3))s.setAttribute('aria-current','step');else s.removeAttribute('aria-current')}
window.scrollTo(0,0)}
function say(t,pre){msg.textContent=t||'';msg.hidden=!t;msg.style.whiteSpace=pre?'pre-wrap':''}
function reset(){token=null;if(timer){clearInterval(timer);timer=null}$('imp-progress').hidden=true;drop.hidden=false;say('');show(1)}
function mo(n){return n>=1024?(n/1024).toFixed(1)+' Go':n+' Mo'}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e}
function phaseOf(step){step=step||'';if(/Extraction|Reconstruction|Préparation/.test(step))return 0;if(/Téléchargement|Installation des d/.test(step))return 1;if(/Compilation de/.test(step))return 2;return 3}
function renderPhases(i,failed){var ul=$('phases');ul.textContent='';PHASES.forEach(function(p,k){var li=el('li',k<i?'ok':k===i&&!failed?'now':'');var ic=el('i','',k<i?'✓':'');li.appendChild(ic);li.appendChild(el('span','',p));ul.appendChild(li)})}
function send(f){say('');if(!/\\.zip$/i.test(f.name)){say('Choisissez un fichier .zip.');return}
drop.hidden=true;$('imp-progress').hidden=false;bar.value=0;state.textContent='Envoi de '+f.name+'…';
var x=upl=new XMLHttpRequest();x.open('POST','/hub/import');x.setRequestHeader('content-type','application/octet-stream');x.setRequestHeader('x-filename',encodeURIComponent(f.name));
x.upload.onprogress=function(e){if(e.lengthComputable){bar.value=Math.round(e.loaded*100/e.total);state.textContent='Envoi… '+bar.value+' %'}};
x.upload.onload=function(){bar.removeAttribute('value');state.textContent='Analyse de l’archive…'};
x.onerror=function(){reset();say('Échec de l’envoi.')};
x.onload=function(){var j={};try{j=JSON.parse(x.responseText)}catch(e){}
if(!j.ok){reset();say(j.message||'Archive refusée.');return}
token=j.token;kind=j.kind;
form.name.value=j.name;form.description.value=j.description||'';
$('imp-idrow').hidden=!j.editableId;form.id.value=j.editableId?j.id:'';
$('imp-okbtn').textContent=j.kind==='source'?'Compiler et installer':'Installer';
$('sum-icon').textContent=(j.name||'?').slice(0,1).toUpperCase();$('sum-name').textContent=j.name;
var facts=$('facts');facts.textContent='';facts.appendChild(el('span','chip','/apps/'+j.id));facts.appendChild(el('span','chip',j.files+' fichiers · '+mo(j.megabytes)));
facts.appendChild(el('span','chip',j.kind==='source'?(j.loose?'Projet incomplet à reconstruire':'Projet source'):'Déjà compilé'));
if(j.existing)facts.appendChild(el('span','chip','Remplace la version installée (données conservées)'));
var w=$('warns');w.textContent='';(j.warnings||[]).forEach(function(t){w.appendChild(el('p','warn',t))});
show(2)};
x.send(f)}
function watch(){show(3);$('imp-err').hidden=true;$('imp-stop').hidden=false;$('imp-retry').hidden=true;poll();timer=setInterval(poll,1500)}
function poll(){fetch('/hub/import/job?token='+encodeURIComponent(token||''),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
if(!j.ok)return;token=j.token||token;var i=phaseOf(j.step);$('step-now').textContent=j.step||'';log.textContent=(j.tail||[]).join('\\n');log.scrollTop=log.scrollHeight;
if(j.state==='done'){clearInterval(timer);timer=null;renderPhases(4);done(j.result)}
else if(j.state==='error'){clearInterval(timer);timer=null;renderPhases(i,true);$('imp-stop').hidden=true;$('imp-retry').hidden=false;var e=$('imp-err');e.hidden=false;e.textContent=(j.error||'Échec.')+(j.errorLog&&j.errorLog.length?'\\n\\n'+j.errorLog.join('\\n'):'')}
else renderPhases(i)}).catch(function(){})}
function done(r){show(4);for(var j=1;j<=3;j++)$('st'+j).className='done';$('ok-title').textContent=(r.name||r.id)+(r.replaced?' est mise à jour':' est installée');
$('ok-open').href='/apps/'+r.id}
drop.addEventListener('click',function(){fileIn.click()});
drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();fileIn.click()}});
fileIn.addEventListener('change',function(){if(fileIn.files[0])send(fileIn.files[0]);fileIn.value=''});
['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(e){var f=e.dataTransfer.files[0];if(f)send(f)});
$('imp-cancel').addEventListener('click',function(){if(token)fetch('/hub/import/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token})});reset()});
$('imp-stop').addEventListener('click',function(){fetch('/hub/import/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token})})});
$('imp-retry').addEventListener('click',reset);$('imp-again').addEventListener('click',reset);
form.addEventListener('submit',function(e){e.preventDefault();var b=$('imp-okbtn');b.disabled=true;say('');
fetch('/hub/import/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token,id:kind==='source'?form.id.value:undefined,name:form.name.value,description:form.description.value})})
.then(function(r){return r.json()}).then(function(j){b.disabled=false;
if(j.ok&&j.job){renderPhases(0);watch()}else if(j.ok){done(j)}else{say(j.message||'Échec.');if(/expiré/.test(j.message||''))reset()}})
.catch(function(){b.disabled=false;say('Échec de l’installation.')})});
fetch('/hub/import/job',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(j.ok&&(j.state==='running'||j.state==='done')){token=j.token;renderPhases(phaseOf(j.step));if(j.state==='running')watch();else{done(j.result)}}}).catch(function(){});
})();
</script>`;

/** Page « Ajouter une application » : choisir le fichier, vérifier, installer. */
function importPage(o) {
  return shell(
    o,
    "apps",
    `<div class="page-head"><a class="link" href="/" style="justify-self:start;margin-left:-8px">← Applications</a><h1>Ajouter une application</h1><p class="muted">Importez le .zip de votre projet Next.js ou Nuxt. Rien n'est installé avant votre validation.</p></div>
<ol class="stepper" aria-label="Étapes"><li id="st1" aria-current="step"><b>1</b>Fichier</li><li id="st2"><b>2</b>Vérification</li><li id="st3"><b>3</b>Installation</li></ol>

<section id="v1" class="panel" aria-label="Choisir le fichier">
<div id="imp-drop" class="drop" tabindex="0" role="button" aria-label="Choisir un fichier .zip">
<strong style="font-size:1.1rem">Déposez le .zip ici</strong><span class="muted">ou cliquez pour le choisir sur ce PC</span>
<input id="imp-file" type="file" accept=".zip,application/zip" hidden></div>
<div id="imp-progress" hidden><progress id="imp-bar" max="100" value="0" style="width:100%"></progress><p class="muted" id="imp-state" style="font-size:.9rem"></p></div>
<p id="imp-msg" class="warn" hidden role="alert"></p>
<div><strong>Ce qui est accepté</strong>
<div class="kinds" style="margin-top:8px">
<div class="kind"><strong>Projet source Next.js ou Nuxt</strong><span class="muted">Avec package.json, sans node_modules ni .next / .output. Compilé sur ce PC (Internet nécessaire, quelques minutes la première fois).</span></div>
<div class="kind"><strong>Fichiers en vrac</strong><span class="muted">page.tsx, layout.tsx… sans dossiers ni package.json : la structure est reconstruite automatiquement.</span></div>
<div class="kind"><strong>Déjà compilé</strong><span class="muted">Dossier .next/standalone (ou créé par preparer-application.mjs) : installé sans compilation.</span></div></div></div>
<details><summary>Compiler soi-même avant d'envoyer</summary><div style="display:grid;gap:8px;margin-top:10px" class="muted">
<p>Le préfixe est figé à la compilation :</p>
<p><code style="font-size:.85rem">BASE_PATH=/apps/mon-id STANDALONE=1 npx next build</code></p>
<p>(PowerShell : <code style="font-size:.85rem">$env:BASE_PATH="/apps/mon-id"; $env:STANDALONE="1"; npx next build</code>)</p>
<p>Compressez en .zip les dossiers <code style="font-size:.85rem">.next</code> (supprimez d'abord <code style="font-size:.85rem">.next/cache</code>) et <code style="font-size:.85rem">public</code>. L'identifiant est lu automatiquement. Importer un identifiant existant le <em>remplace</em> ; ses données sont conservées.</p></div></details>
<details><summary>Ou copier le dossier à la main</summary><p class="muted" style="margin-top:8px">Dans <code style="font-size:.85rem">${esc(o.appsDir)}</code>, puis <button class="btn quiet small" data-post="/hub/rescan" data-busy="Recherche…">Chercher de nouvelles applications</button></p></details>
</section>

<section id="v2" class="panel" hidden aria-label="Vérification">
<div class="summary-card"><span class="ph" id="sum-icon">?</span><div><h2 id="sum-name"></h2><div class="facts" id="facts" style="margin-top:6px"></div></div></div>
<div id="warns" style="display:grid;gap:8px"></div>
<form id="imp-form" style="display:grid;gap:12px">
<label class="field">Nom affiché<input name="name" maxlength="60" required autocomplete="off"></label>
<label class="field">Description<input name="description" maxlength="200" autocomplete="off"></label>
<label class="field" id="imp-idrow" hidden>Identifiant (adresse /apps/…)<input name="id" maxlength="41" pattern="[a-z0-9][a-z0-9\\-]*" title="minuscules, chiffres et tirets" autocomplete="off"></label>
<div class="row"><button class="btn" id="imp-okbtn">Installer</button><button type="button" class="btn quiet" id="imp-cancel">Annuler</button></div></form>
</section>

<section id="v3" class="panel" hidden aria-label="Installation" aria-live="polite">
<h2>Installation en cours</h2>
<ul class="phases" id="phases"></ul>
<p class="muted" id="step-now" style="font-size:.9rem"></p>
<pre id="imp-err" class="warn" hidden style="white-space:pre-wrap;max-height:16rem;overflow:auto;margin:0"></pre>
<details><summary>Détails techniques</summary><pre id="imp-log" style="max-height:14rem;margin-top:8px"></pre></details>
<div class="row"><button type="button" class="btn quiet" id="imp-stop">Annuler la compilation</button><button type="button" class="btn" id="imp-retry" hidden>Recommencer</button></div>
</section>

<section id="v4" class="panel ok-panel" hidden aria-label="Terminé">
<div class="big-ok" aria-hidden="true">✓</div><h2 id="ok-title"></h2><p class="muted">Elle est démarrée et visible sur le téléphone.</p>
<div class="row" style="justify-content:center"><a class="btn" id="ok-open" href="/">Ouvrir</a><button class="btn quiet" id="imp-again">Ajouter une autre</button><a class="btn quiet" href="/">Retour aux applications</a></div>
</section>`,
    IMPORT_SCRIPT,
  );
}

/** Page 2 : synchronisation (entre PC) et dossier des données (Windows + Ubuntu sur un même PC). */
function syncPage(o) {
  const peers = o.sync.peers;
  const online = peers.filter((p) => p.online).length;
  const d = o.data;
  const first = d.problem ? "donnees" : peers.length ? "sync" : "donnees";
  const tab = (id, ico, title, sub, badge, cls) =>
    `<button type="button" class="tabcard" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="${id}" aria-selected="false"><span class="ti">${ico}</span><span class="tt"><b>${title}</b><small>${sub}</small></span><span class="badge ${cls}">${badge}</span></button>`;
  const head = `<div class="page-head"><h1>Synchronisation</h1><p class="muted">Gardez les mêmes données sur tous vos ordinateurs.</p></div>
<div class="tabs2" role="tablist" aria-label="Type de synchronisation">
${tab("donnees", SIC.pc, "Un seul PC", "Windows et Ubuntu", d.problem ? "Problème" : d.isDefault ? "Pas réglé" : "Partagé", d.problem ? "bad" : d.isDefault ? "wait" : "ok")}
${tab("sync", SIC.pcs, "Plusieurs PC", peers.length ? `${peers.length} jumelé${peers.length > 1 ? "s" : ""} · ${online} en ligne` : "Fixe, portable…", peers.length ? (online ? "Actif" : "Hors ligne") : "Aucun", peers.length ? (online ? "ok" : "bad") : "wait")}
</div>`;
  const script = `<script>(function(){const tabs=[...document.querySelectorAll('[role=tab]')],panels={donnees:document.getElementById('donnees'),sync:document.getElementById('sync')};
function show(id,focus){if(!panels[id])id='${first}';for(const t of tabs){const on=t.dataset.tab===id;t.setAttribute('aria-selected',on?'true':'false');t.tabIndex=on?0:-1}
for(const k in panels)panels[k].hidden=k!==id;try{sessionStorage.setItem('ma-sync-tab',id)}catch(e){}if(focus)panels[id].scrollIntoView({block:'nearest'})}
for(const t of tabs){t.addEventListener('click',()=>show(t.dataset.tab));t.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const n=tabs[(tabs.indexOf(t)+1)%tabs.length];n.focus();show(n.dataset.tab);e.preventDefault()}})}
addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(h==='donnees'||h==='sync')show(h)});let s=null;try{s=sessionStorage.getItem('ma-sync-tab')}catch(e){}const h=location.hash.slice(1);show(h==='donnees'||h==='sync'?h:(s||'${first}'));
for(const b of document.querySelectorAll('.drive'))b.addEventListener('click',()=>{for(const x of document.querySelectorAll('.drive'))x.classList.toggle('sel',x===b);const f=document.getElementById('dataform');if(f){f.dir.value=b.dataset.dir;document.getElementById('usebtn').focus()}},true)})();</script>`;
  return shell(o, "sync", head + dataPanel(o) + syncPanel(o), script);
}

function infoBlock(r) {
  const i = r.def.info || { tech: [] };
  const items = [...i.tech.map((t) => [t.label, t.version])];
  if (i.db) items.push(["Base de données", i.db]);
  if (i.node) items.push(["Node.js", i.node]);
  if (i.version) items.unshift(["Version", i.version]);
  items.push(["Adresse", r.def.basePath + "/"]);
  if (r.port) items.push(["Port", String(r.port)]);
  return `<dl class="info">${items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
}

/** Page 3 : réglages du PC (pare-feu, démarrage, journaux, arrêt). */
function settingsPage(o) {
  const st = (r) => STATUS[r.status] || STATUS.stopped;
  const on = (r) => !!(o.storage && o.storage[r.def.id]);
  const rows = o.apps
    .map(
      (r) => `<article class="appcard" id="${esc(r.def.id)}">
<div class="ah"><span class="ai" aria-hidden="true">${ICONS.apps}</span><div class="at"><strong>${esc(r.def.name)}</strong><span class="pill ${st(r)[1]}" data-app="${esc(r.def.id)}">${esc(st(r)[0])}</span></div>
<span class="row"><a class="btn quiet small" href="/hub/log/${esc(r.def.id)}">${SIC.log} Journal</a><button class="btn quiet small" data-post="/hub/restart/${esc(r.def.id)}" data-busy="Redémarrage…">${SIC.redo} Redémarrer</button></span></div>
${infoBlock(r)}
<div class="setrow"><div class="st"><strong>Données sur le PC</strong><span class="muted">${on(r) ? "Ce qui est saisi (PC, téléphone) est enregistré sur ce PC et fusionné." : "Les données de cette application restent dans chaque navigateur."}</span></div>
<button class="switch ${on(r) ? "on" : ""}" role="switch" aria-checked="${on(r) ? "true" : "false"}" aria-label="Données sur le PC pour ${esc(r.def.name)}" data-storage="${esc(r.def.id)}" data-on="${on(r) ? "0" : "1"}"><span class="knob"></span></button></div></article>`,
    )
    .join("");
  const themes = Object.entries(THEMES)
    .map(([k, t]) => `<button class="sw2" data-theme="${k}" aria-pressed="${k === currentTheme}"><span class="prev" style="--c:${t.color}"><i></i><i></i><i></i></span><span class="lb">${t.label}</span><span class="ck">${SIC.check}</span></button>`)
    .join("");
  return shell(
    o,
    "settings",
    `<div class="page-head"><h1>Réglages</h1><p class="muted">Visibles seulement depuis ce PC.</p></div>
${o.setup.firewall === "declined" ? `<p class="warn">Le pare-feu n'a pas été configuré : le téléphone et l'autre PC ne pourront pas se connecter. <button class="btn small" data-post="/hub/firewall">Autoriser le téléphone</button></p>` : ""}
<section class="panel" aria-labelledby="apparence"><div><h2 id="apparence">Apparence</h2><p class="muted" style="margin:2px 0 0">Couleur de Triviae, sur ce PC et sur le téléphone. Le thème clair ou sombre suit l'appareil.</p></div>
<div class="themes">${themes}</div></section>
<section class="panel" aria-labelledby="etat"><div><h2 id="etat">Applications</h2><p class="muted" style="margin:2px 0 0">Journal, redémarrage et stockage des données de chaque application.</p></div>${rows || `<p class="muted">Aucune application pour l'instant. <a href="/importer">En ajouter une</a></p>`}</section>
<section class="panel" aria-labelledby="cp"><div><h2 id="cp">Copie sur le téléphone</h2><p class="muted" style="margin:2px 0 0">Permet d'utiliser les applications sans le PC. Le téléphone installe une fois le certificat de ce PC (page « Copie sur le téléphone », ouverte depuis le téléphone).</p></div>
${o.tls && o.tls.ok ? `<div class="setrow"><div class="st"><strong>Connexion sécurisée <span class="badge ok">prête</span></strong><span class="muted">Adresses : ${o.tls.hosts.filter((h) => h !== "127.0.0.1").map(esc).join(", ") || "aucune"} · valable jusqu'au ${new Date(o.tls.until).toLocaleDateString("fr-FR")}</span></div><a class="btn quiet small" href="/hub/ca.crt" download="Triviae.crt">Certificat</a></div>` : `<p class="warn">La connexion sécurisée n'a pas pu être préparée${o.tls && o.tls.error ? " : " + esc(o.tls.error) : ""}.</p>`}</section>
<section class="panel" aria-labelledby="pc"><h2 id="pc">Ce PC</h2>${
      o.canAutostart
        ? `<div class="setrow"><div class="st"><strong>Démarrer avec l'ordinateur</strong><span class="muted">Triviae se lance à l'ouverture de la session, sans rien faire.</span></div>
<button class="switch ${o.autostart ? "on" : ""}" role="switch" aria-checked="${o.autostart ? "true" : "false"}" aria-label="Démarrer avec l'ordinateur" data-post="/hub/autostart"><span class="knob"></span></button></div>`
        : ""
    }
${
      o.canShortcut
        ? `<div class="setrow"><div class="st"><strong>Raccourci sur le Bureau</strong><span class="muted">Crée (ou recrée) l'icône « Triviae » sur le Bureau. Elle est aussi ajoutée automatiquement au premier lancement.</span></div>
<button class="btn small" data-post="/hub/shortcut" data-busy="Création…" data-done="Raccourci créé ✓" data-fail="Impossible de le créer">Mettre sur le Bureau</button></div>`
        : ""
    }
<p class="note"><span class="ni">${SIC.shield}</span><span><strong>Pas de mot de passe.</strong> Toute personne connectée à votre Wi-Fi peut ouvrir vos applications. N'exposez pas ce PC sur Internet.</span></p></section>`,
  );
}

const OFFLINE_SCRIPT = `<script>
(function(){
var $=function(i){return document.getElementById(i)};
var https=location.protocol==='https:';
var KEY='ma-copie';
function when(t){try{return new Date(t).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function last(){try{var j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&j.t?j:null}catch(e){return null}}
function showLast(){var l=last(),e=$('lastcopy');if(!e)return;e.textContent=l?'Dernière copie : '+when(l.t)+' · '+l.pages+' pages, '+l.files+' fichiers.':'Aucune copie enregistrée pour l\\u2019instant.'}
if(!https){
  $('s-https').hidden=true;$('s-http').hidden=false;
  var go=$('gohttps');go.href='https://'+location.host+'/hors-ligne';
  fetch('https://'+location.host+'/hub/ping',{mode:'no-cors',cache:'no-store'}).then(function(){
    $('certok').hidden=false;$('certko').hidden=true;go.classList.remove('quiet');
  }).catch(function(){$('certok').hidden=true;$('certko').hidden=false});
  return;
}
$('s-http').hidden=true;$('s-https').hidden=false;showLast();
var st=$('swstate'),btn=$('savebtn'),bar=$('savebar'),msg=$('savemsg');
if(!('serviceWorker' in navigator)){st.textContent='Ce navigateur ne permet pas la copie hors ligne.';btn.disabled=true;return}
navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(function(){return navigator.serviceWorker.ready}).then(function(){
  st.textContent='Copie hors ligne activée sur ce téléphone.';st.className='badge ok';btn.disabled=false;
}).catch(function(e){st.textContent='Impossible d\\u2019activer la copie : '+(e&&e.message||e);st.className='badge bad'});
function same(u){try{var x=new URL(u,location.href);return x.origin===location.origin?x.pathname+x.search:null}catch(e){return null}}
function assetsOf(html){var out={},m,re=/(?:src|href)=["']([^"']+)["']/g;
  while((m=re.exec(html))){var p=same(m[1]);if(p&&!/^\\/hub\\/(?!icon)/.test(p))out[p]=1}
  var re2=/\\/apps\\/[a-z0-9-]+\\/_next\\/static\\/[^"'\\\\\\s)<>]+/g;
  while((m=re2.exec(html)))out[m[0]]=1;
  return Object.keys(out)}
btn.addEventListener('click',function(){
  btn.disabled=true;msg.textContent='';bar.hidden=false;bar.value=0;
  fetch('/offline/apps.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(list){
    var pages=['/'];list.forEach(function(a){a.paths.forEach(function(p){if(pages.indexOf(p)<0)pages.push(p)})});
    var files={},done=0,total=pages.length,nf=0,np=0;
    function step(){bar.max=Math.max(total,1);bar.value=done;msg.textContent='Enregistrement… '+done+' / '+total}
    var chain=Promise.resolve();
    pages.forEach(function(p){chain=chain.then(function(){
      return fetch(p,{cache:'reload'}).then(function(r){
        if(!r.ok)throw 0;np++;return r.text();
      }).then(function(h){assetsOf(h).forEach(function(a){if(!files[a]){files[a]=1;total++}})}).catch(function(){}).then(function(){done++;step()});
    })});
    return chain.then(function(){
      var fl=Object.keys(files),c2=Promise.resolve();
      fl.forEach(function(a){c2=c2.then(function(){return fetch(a).then(function(r){if(r.ok)nf++}).catch(function(){}).then(function(){done++;step()})})});
      return c2.then(function(){return {pages:np,files:nf}});
    });
  }).then(function(res){
    try{localStorage.setItem(KEY,JSON.stringify({t:Date.now(),pages:res.pages,files:res.files}))}catch(e){}
    msg.textContent='Copie enregistrée.';bar.hidden=true;showLast();btn.disabled=false;
  }).catch(function(){msg.textContent='La copie a échoué : le PC est-il joignable ?';bar.hidden=true;btn.disabled=false});
});
})();
</script>`;

/** Page « Copie sur le téléphone » (ouverte depuis le téléphone). */
function offlinePage(o) {
  const body = `<main id="contenu"><p><a class="btn quiet small" href="/">‹ Triviae</a></p>
<div class="page-head"><h1>Copie sur le téléphone</h1><p class="muted">Gardez vos applications utilisables sans le PC : le téléphone enregistre une copie des pages et de vos données. Les modifications faites hors ligne partent vers le PC dès qu'il est de nouveau joignable.</p></div>
<section class="panel" id="s-http" hidden>
<h2>Activer la copie (une seule fois)</h2>
<ol class="steps"><li><span><b>Installez le certificat du PC.</b> Touchez « Télécharger le certificat », puis ouvrez Paramètres → Sécurité → Chiffrement et identifiants → Installer un certificat → <b>Certificat d'autorité de certification</b> et choisissez le fichier.</span></li>
<li><span><b>Ouvrez la version sécurisée</b> de cette page, puis touchez « Enregistrer la copie ».</span></li></ol>
<div class="row"><a class="btn quiet" href="/hub/ca.crt" download="Triviae.crt">Télécharger le certificat</a><a class="btn quiet" id="gohttps" href="#">Ouvrir la version sécurisée</a></div>
<p class="badge ok" id="certok" hidden style="white-space:normal">Certificat reconnu : vous pouvez ouvrir la version sécurisée.</p>
<p class="muted" id="certko" hidden>Tant que le certificat n'est pas installé, la version sécurisée affichera un avertissement.</p>
</section>
<section class="panel" id="s-https" hidden>
<h2>Copie hors ligne</h2>
<p class="badge" id="swstate" style="white-space:normal">Activation…</p>
<p class="muted" id="lastcopy" style="margin:0"></p>
<div class="row"><button class="btn" id="savebtn" type="button" disabled>Enregistrer la copie maintenant</button></div>
<progress id="savebar" hidden style="width:100%"></progress><p class="muted" id="savemsg" role="status" style="margin:0"></p>
<p class="muted" style="margin:0;font-size:.9rem">Hors ligne, vous retrouvez les pages ouvertes ou enregistrées, et vos données si l'application les range sur le PC (« Données sur le PC »). Les données d'une application à base de données sont en lecture seule hors ligne.</p>
</section></main>`;
  return layout("Copie sur le téléphone", body) + OFFLINE_SCRIPT;
}

const statusOf = (rec) => {
  const [label, tone] = STATUS[rec.status] || STATUS.stopped;
  return { id: rec.def.id, label, tone, status: rec.status };
};

function waiting(rec) {
  const name = rec ? esc(rec.def.name) : "L'application";
  return layout(
    name,
    `<main><h1>${name}</h1><p class="muted">L'application démarre, un instant…</p><p><a class="btn quiet" href="/">Toutes mes applications</a></p></main>`,
    `<meta http-equiv="refresh" content="2">`,
  );
}

function notFound() {
  return layout("Introuvable", `<main><h1>Page introuvable</h1><p><a class="btn" href="/">Triviae</a></p></main>`);
}

function log(rec, text) {
  const lines = String(text || "").replace(/\s+$/, "").split("\n").map((l) => {
    const e = esc(l);
    let c = "";
    if (/^\s*(✓|√)/.test(l)) c = "ok";
    else if (/^\s*(✗|×|⨯)|error|erreur|failed|ELIFECYCLE/i.test(l)) c = "bad";
    else if (/^\s*(⚠|warn)/i.test(l)) c = "warn";
    else if (/^\s*▲/.test(l)) c = "hd";
    else if (/^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(l)) c = "req";
    return `<span class="ln ${c}">${e || " "}</span>`;
  }).join("");
  return layout(
    `Journal : ${rec.def.name}`,
    `<style>
body{background:#0e1218}
.term{max-width:880px;margin:0 auto;padding:20px 16px 40px}
.term h1{font:600 1.15rem ui-monospace,SFMono-Regular,Consolas,monospace;color:#e6ebf2;margin:0 0 14px}
.term h1 b{color:#3ddc97;font-weight:600}
.term pre{background:#161c25;color:#cfd7e3;border:1px solid #232c39;border-radius:0;padding:16px 18px;font:.88rem/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;max-height:none;min-height:140px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.ln{display:block}.ln.hd{color:#fff;font-weight:600}.ln.ok{color:#3ddc97}.ln.bad{color:#ff7b72}.ln.warn{color:#f5b83d}.ln.req{color:#8b97a8}
.term a{color:#8bb4ff;font:600 .9rem ui-monospace,Consolas,monospace;text-decoration:none}.term a:hover{text-decoration:underline}
</style>
<main class="term"><h1>Journaux — <b>${esc(rec.def.name)}</b></h1><pre>${text ? lines : '<span class="ln req">(vide)</span>'}</pre><p><a href="/">← Retour</a></p></main>`,
  );
}

module.exports = { linksPage, offlinePage, setTheme, getTheme, importPage, home, syncPage, settingsPage, waiting, notFound, log, statusOf };
