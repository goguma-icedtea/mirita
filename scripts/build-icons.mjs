// Generate installable PNG assets from the supplied brand logo without stretching it.
import { existsSync } from 'node:fs';
import { readFile,writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{const page=await browser.newPage();const source='data:image/png;base64,'+(await readFile(new URL('../public/assets/logo.png',import.meta.url))).toString('base64');
for(const size of [192,512]){const png=await page.evaluate(async({source,size})=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle='#F3F8FF';ctx.fillRect(0,0,size,size);const scale=size*.7/Math.max(image.width,image.height);const w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);return canvas.toDataURL('image/png').split(',')[1];},{source,size});await writeFile(new URL(`../public/assets/icon-${size}.png`,import.meta.url),Buffer.from(png,'base64'));}
}finally{await browser.close();}
