const {chromium}=require('playwright');
const {existsSync}=require('node:fs');
const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
module.exports={chromium:{launch:options=>chromium.launch({...options,...(executablePath?{executablePath}:{})})}};
