import fs from "node:fs";
import path from "node:path";
const base=(process.env.MEDUSA_BACKEND_URL||"http://localhost:9000").replace(/\/$/,"");
const key=process.env.MEDUSA_PUBLISHABLE_KEY;
const regions={usa:process.env.USA_REGION_ID||"reg_01KXT623CTGM9NJJYK2G4DQW7E",canada:process.env.CANADA_REGION_ID||"reg_01KVJF9HSCYKAZC677GH1AC6C8"};
if(!key) throw new Error("MEDUSA_PUBLISHABLE_KEY is required");
const fields="id,title,handle,status,metadata,thumbnail,variants.*,variants.prices.*,variants.calculated_price.*";
const output=path.resolve("reports","store-api-captures");fs.mkdirSync(output,{recursive:true});
async function capture(label,url,file){let status=null,body={},error="";try{const r=await fetch(url,{headers:{"x-publishable-api-key":key}});status=r.status;body=await r.json()}catch(e){error=e.message}const products=body.products||(body.product?[body.product]:[]),apple=products.find(p=>p.id==="prod_01KVSFB71XDNGFJN01RH3C2G1M"||p.handle==="organic-apples");const summary={label,urlWithoutSecret:url,status,count:products.length,productIds:products.map(p=>p.id),titles:products.map(p=>p.title),organicApplesPresent:Boolean(apple),organicApplesPosition:apple?products.indexOf(apple):null,organicApplesVariantPresent:Boolean(apple?.variants?.some(v=>v.id==="variant_01KVSFB75GZJ4N0B9SY6BXDTZC")),organicApplesCalculatedPrice:apple?.variants?.[0]?.calculated_price?.calculated_amount??null,organicApplesPriceCurrency:apple?.variants?.[0]?.calculated_price?.currency_code??null,responseError:error};fs.writeFileSync(path.join(output,file),JSON.stringify({summary,body},null,2));console.log(JSON.stringify(summary));return summary}
for(const [name,region] of Object.entries(regions)) await capture(`${name}-listing`,`${base}/store/products?limit=200&region_id=${region}&fields=${encodeURIComponent(fields)}`,`${name}-listing.json`);
await capture("organic-apples-by-id",`${base}/store/products/prod_01KVSFB71XDNGFJN01RH3C2G1M?region_id=${regions.usa}&fields=${encodeURIComponent(fields)}`,"organic-apples-by-id.json");
await capture("organic-apples-search",`${base}/store/products?limit=20&q=Organic%20Apples&region_id=${regions.usa}&fields=${encodeURIComponent(fields)}`,"organic-apples-search.json");
