'use strict';
// Offline documentation, rendered from the three reviewed UTF-8 text guides.
const fs = require('fs'), path = require('path');
const languages = [
  {id:'zhCN',lang:'zh-Hans',name:'简体中文',title:'安装与使用说明',contents:'目录',plain:'纯文本说明',home:'选择语言',intro:'安装、登录 AI、日常使用、故障排查、备份与卸载。'},
  {id:'zhTW',lang:'zh-Hant',name:'繁體中文',title:'安裝與使用說明',contents:'目錄',plain:'純文字說明',home:'選擇語言',intro:'安裝、登入 AI、日常使用、疑難排解、備份與解除安裝。'},
  {id:'en',lang:'en',name:'English',title:'Installation & User Guide',contents:'Contents',plain:'Plain-text guide',home:'Choose language',intro:'Installation, AI sign-in, daily use, troubleshooting, backups and removal.'}
];
const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const style = `*{box-sizing:border-box}body{margin:0;background:#f4f0e7;color:#27241f;font:17px/1.75 system-ui,"Microsoft YaHei","Microsoft JhengHei",sans-serif}main{max-width:960px;margin:auto;padding:40px 24px 72px}header{border-bottom:1px solid #cabd9f;padding-bottom:22px;margin-bottom:28px}small{color:#685a3e;letter-spacing:.08em}h1{font-size:clamp(27px,4vw,38px);line-height:1.35}h2{font-size:25px;margin:42px 0 20px;scroll-margin-top:20px}p{white-space:pre-line;overflow-wrap:anywhere}a{color:#694500;text-underline-offset:4px}nav{display:flex;gap:12px;flex-wrap:wrap}nav a,.card{display:block;border:1px solid #cabd9f;border-radius:8px;padding:8px 16px;background:#fffdf8}nav a[aria-current=page]{background:#413821;color:white}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}.card{padding:24px;text-decoration:none}.card strong{font-size:24px}.card p{font-size:15px}aside{padding:16px 24px;background:#ebe3d2;border-radius:8px}footer{margin-top:44px;border-top:1px solid #cabd9f;padding-top:20px;font-size:14px}@media print{nav,.cards,aside{display:none}body{background:white}main{padding:0}a{color:inherit}h2{break-after:avoid}}`;
function page(lang,title,body){return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style></head><body><main>${body}</main></body></html>\n`;}
function nav(active){return `<nav aria-label="Language">${languages.map(l=>`<a href="Install-Guide-${l.id}.html" lang="${l.lang}"${active===l.id?' aria-current="page"':''}>${l.name}</a>`).join('')}</nav>`;}
function writeText(file,text){fs.writeFileSync(file,'\uFEFF'+text.replace(/^\uFEFF/,''),'utf8');}
function render(output,version){
  fs.mkdirSync(output,{recursive:true});
  for(const l of languages){
    const text=fs.readFileSync(path.join(__dirname,'guides',`Install-Guide-${l.id}.txt`),'utf8').replace(/^\uFEFF/,'');
    if(!text.includes(version))throw Error(`Guide version mismatch: ${l.id}`);
    writeText(path.join(output,`Install-Guide-${l.id}.txt`),text);
    const paragraphs=text.trim().split(/\r?\n\s*\r?\n/), toc=[];
    let section=0;
    const content=paragraphs.map((p,index)=>{
      if(/^(?:[一二三四五六七]+、|[1-7]\. )/.test(p) && !p.includes('\n')){
        const id='section-'+(++section);toc.push(`<li><a href="#${id}">${escape(p)}</a></li>`);
        return `<h2 id="${id}">${escape(p)}</h2>`;
      }
      return `<p>${escape(p)}</p>`;
    }).join('\n');
    if(section!==7)throw Error(`Guide must contain all seven sections: ${l.id}`);
    fs.writeFileSync(path.join(output,`Install-Guide-${l.id}.html`),page(l.lang,l.title,`<header><small>Azeroth Adventure Companion · ${version}</small><h1>${l.title}</h1>${nav(l.id)}<p><a href="README.html">${l.home}</a> · <a href="Install-Guide-${l.id}.txt">${l.plain}</a></p></header><aside><strong>${l.contents}</strong><ol>${toc.join('')}</ol></aside>${content}`));
  }
  const chooser=page('en','Azeroth Adventure Companion — 简体中文 / 繁體中文 / English',`<header><small>Azeroth Adventure Companion · ${version}</small><h1><span lang="zh-Hans">艾泽拉斯冒险伙伴</span><br><span lang="zh-Hant">艾澤拉斯冒險夥伴</span></h1><p>Installation & User Guide</p></header><div class="cards">${languages.map(l=>`<a class="card" href="Install-Guide-${l.id}.html" lang="${l.lang}"><strong>${l.name}</strong><p>${l.intro}</p></a>`).join('')}</div><footer><p lang="zh-Hans">三种语言均为完整说明，可离线查看。安装器和桌面管理窗口的按钮目前为中文；英文说明附有原按钮名。游戏内语言单独设置。</p><p lang="zh-Hant">三種語言皆為完整說明，可離線閱讀。安裝程式與桌面管理視窗的按鈕目前為中文；英文說明附有原按鈕名稱。遊戲內語言另行設定。</p><p>All three guides are complete and work offline. Installer and desktop manager buttons are currently in Chinese; the English guide includes their original labels. The in-game language is configured separately.</p><p>Plain text: ${languages.map(l=>`<a href="Install-Guide-${l.id}.txt" lang="${l.lang}">${l.name}</a>`).join(' · ')}</p></footer>`);
  fs.writeFileSync(path.join(output,'README.html'),chooser);
  writeText(path.join(output,'README.txt'),`Azeroth Adventure Companion / 艾泽拉斯冒险伙伴 / 艾澤拉斯冒險夥伴\n${version} · Windows x64 Beta\n\n简体中文：打开 README.html 选择语言，或阅读 Install-Guide-zhCN.txt。\n繁體中文：開啟 README.html 選擇語言，或閱讀 Install-Guide-zhTW.txt。\nEnglish: Open README.html to choose a language, or read Install-Guide-en.txt.\n\n首次使用：完整解压 → 安装 → 登录 AI → 启动桥接 → 重启游戏 → /wow-ai\n首次使用：完整解壓縮 → 安裝 → 登入 AI → 啟動橋接 → 重新啟動遊戲 → /wow-ai\nFirst use: Extract all → Install → Sign in to AI → Start bridge → Restart game → /wow-ai\n\nInstall.cmd = 安装 / 安裝 / Install\n说明 / 說明 / Help = 三语离线说明 / 三語離線說明 / Offline guides\n\n安装器按钮目前为中文；英文说明提供中文按钮对照。\n安裝程式按鈕目前為中文；英文說明提供中文按鈕對照。\nInstaller buttons are currently in Chinese; the English guide includes matching labels.\n\nhttps://github.com/hukekele-dotcom/azeroth-adventure-companion\n`);
  // Preserve the old guide filename for existing users and bookmarks.
  fs.copyFileSync(path.join(output,'Install-Guide-zhCN.txt'),path.join(output,'安装说明.txt'));
}
module.exports={render,languages};
if(require.main===module)render(process.argv[2],require('../../package.json').version);
