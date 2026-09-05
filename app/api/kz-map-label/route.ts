import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const CYR_TO_AR: Record<string, string> = {
  А:"ا", а:"ا", Ә:"ٵ", ә:"ٵ", Б:"ب", б:"ب", В:"ۆ", в:"ۆ",
  Г:"گ", г:"گ", Ғ:"ع", ғ:"ع", Д:"د", д:"د", Е:"ە", е:"ە",
  Ё:"يو", ё:"يو", Ж:"ج", ж:"ج", З:"ز", з:"ز", И:"ي", и:"ي",
  Й:"ي", й:"ي", К:"ك", к:"ك", Қ:"ق", қ:"ق", Л:"ل", л:"ل",
  М:"م", м:"م", Н:"ن", н:"ن", Ң:"ڭ", ң:"ڭ", О:"و", о:"و",
  Ө:"ٶ", ө:"ٶ", П:"پ", п:"پ", Р:"ر", р:"ر", С:"س", с:"س",
  Т:"ت", т:"ت", У:"ۋ", у:"ۋ", Ұ:"ۇ", ұ:"ۇ", Ү:"ٷ", ү:"ٷ",
  Ф:"ف", ф:"ف", Х:"ح", х:"ح", Һ:"ھ", һ:"ھ", Ц:"تس", ц:"تس",
  Ч:"چ", ч:"چ", Ш:"ش", ш:"ش", Щ:"شش", щ:"شش", Ы:"ى", ы:"ى",
  І:"ٸ", і:"ٸ", Э:"يە", э:"يە", Ю:"يۋ", ю:"يۋ", Я:"يا", я:"يا",
  Ъ:"", ъ:"", Ь:"", ь:"",
};

const EXACT: Record<string, string> = {
  "中国":"جۇڭگو",
  "中华人民共和国":"جۇڭگو",
  "美国":"امەريكا",
  "俄罗斯":"رەسەي",
  "乌克兰":"ۋكراينا",
  "伊朗":"يران",
  "比利时":"بەلگيا",
  "以色列":"يزرايىل",
  "巴勒斯坦":"پالەستينا",
  "欧盟":"ەۋروپا وداعى",
  "北约":"ناتو",
  "NATO":"ناتو",
  "约旦河西岸":"يوردان ٶزەنٸنٸڭ باتىس جاعالاۋى",
  "台湾省":"تايۋان ٶلكەسٸ",
  "新北市":"شىنبەي قالاسى",
  "北京市":"بىيجيڭ قالاسى",
  "丰台区":"فەڭتاي اۋدانى",
  "西城区":"شىچىڭ اۋدانى",
  "教育部":"بٸلٸم بەرۋ مينيسترلٸگٸ",
  "新疆":"شىنجاڭ",
  "新疆维吾尔自治区":"شىنجاڭ ۇيعۇر اۆتونوم رايونى",
  "石河子市":"شىحزى قالاسى",
  "石河子职业技术大学":"شىحزى كەسٸپتٸك تەحنيكا ۋنيۆەرسيتەتٸ",
  "阿克苏地区":"اقسۇ ايماعى",
  "柯柯牙":"كٶكيا",
  "柯柯牙生态治理区":"كٶكيا ەكولوگيالىق تٷزەۋ رايونى",
  "莫斯科":"مٵسكەۋ",
  "华盛顿":"ۋاشينگتون",
  "基辅":"كيەۆ",
  "哈尔克岛附近海域":"حارك ارالى ماڭىنداعى تەڭٸز اۋدانى",
  "纳坦兹附近":"ناتانز ماڭى",
  "纳坦兹附近核设施":"ناتانز ماڭىنداعى يادرو نىسانى",
  "纳坦兹附近 Pickaxe Mountain":"ناتانز ماڭى",
  "乌克兰国家安全局基辅总部":"ۋكراينا مەملەكەتتٸك قاۋٸپسىزدٸك قىزمەتٸنٸڭ كيەۆ باس كەڭسەسٸ",
  "布鲁塞尔欧盟机构区":"بريۋسسەل ەۋروپا وداعى مەكەمەلەر اۋدانى",
  "北京种业大会丰台主会场":"بىيجيڭ تۇقۇم شارۋاشىلىعى قۇرىلتايىنىڭ فەڭتايداعى باس الاڭى",
  "橡胶草天然橡胶中试提取线":"كاۋچۋك شٶبٸنٸڭ تەبيعي كاۋچۋك سىناق ٶندٸرٸس جەلٸسٸ",
};

function hasArabic(s: string) { return /[\u0600-\u06ff]/.test(s); }
function hasCyrillic(s: string) { return /[\u0400-\u04ff]/.test(s); }
function hasLatin(s: string) { return /[A-Za-z]/.test(s); }
function hasHan(s: string) { return /[\u3400-\u9fff]/.test(s); }

function cyrToArab(s: string): string {
  return Array.from(s).map((ch) => CYR_TO_AR[ch] ?? ch).join("");
}

function latinToArab(input: string): string {
  let s = input.toLowerCase();
  const pairs: Array<[RegExp,string]> = [
    [/sh/g,"ش"],[/ch/g,"چ"],[/zh/g,"ج"],[/ng/g,"ڭ"],[/gh/g,"ع"],[/kh/g,"ح"],
    [/ya/g,"يا"],[/yu/g,"يۋ"],[/yo/g,"يو"],[/ye/g,"يە"],[/ts/g,"تس"],
  ];
  for (const [r,v] of pairs) s = s.replace(r,v);
  const map: Record<string,string> = {
    a:"ا",b:"ب",c:"ك",d:"د",e:"ە",f:"ف",g:"گ",h:"ھ",i:"ي",j:"ج",k:"ك",l:"ل",m:"م",n:"ن",
    o:"و",p:"پ",q:"ق",r:"ر",s:"س",t:"ت",u:"ۇ",v:"ۆ",w:"ۋ",x:"كس",y:"ي",z:"ز",
  };
  return Array.from(s).map(ch => map[ch] ?? ch).join("").replace(/\s+/g," ").trim();
}

function toArabicLabel(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  if (EXACT[t]) return EXACT[t];
  if (hasArabic(t) && !hasHan(t)) return t;
  if (hasCyrillic(t) && !hasHan(t)) return cyrToArab(t);
  if (hasLatin(t) && !hasHan(t)) return latinToArab(t);
  return "";
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const text = String(p.get("text") || "").trim();
  const lon = Number(p.get("lon"));
  const lat = Number(p.get("lat"));
  if (!text) return NextResponse.json({ label: "" }, { status: 400 });

  const exact = toArabicLabel(text);
  if (exact) return NextResponse.json({ label: exact, source: "dictionary" }, { headers: { "Cache-Control":"public, max-age=86400, s-maxage=604800" } });

  try {
    const qs = new URLSearchParams({
      q: text,
      format: "jsonv2",
      namedetails: "1",
      addressdetails: "1",
      limit: "8",
      "accept-language": "kk,en,zh-CN",
    });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "KazakhBroadcastNewsGlobe/1.0 (Kazakh Arabic map labels)",
      },
    });
    if (r.ok) {
      const rows = await r.json<any[]>();
      const scored = (Array.isArray(rows) ? rows : []).map((row) => {
        const rl = Number(row.lon), rt = Number(row.lat);
        let d = 999;
        if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(rl) && Number.isFinite(rt)) {
          d = Math.hypot((rl-lon)*Math.cos(lat*Math.PI/180), rt-lat);
        }
        return { row, d };
      }).sort((a,b)=>a.d-b.d);
      for (const { row } of scored) {
        const nd = row?.namedetails || {};
        const candidates = [nd["name:kk-Arab"], nd["name:kk"], nd["official_name:kk"], nd["short_name:kk"], nd["name:en"], row?.name];
        for (const c of candidates) {
          const out = toArabicLabel(String(c || ""));
          if (out && !hasHan(out)) {
            return NextResponse.json({ label: out, source: "nominatim" }, { headers: { "Cache-Control":"public, max-age=86400, s-maxage=604800" } });
          }
        }
      }
    }
  } catch (e) {
    console.error("kz map label lookup failed", e);
  }

  // Never put Simplified Chinese back onto the map. Unknown labels stay neutral until curated.
  return NextResponse.json({ label: "ٴ…" , source: "fallback" }, { headers: { "Cache-Control":"public, max-age=3600, s-maxage=86400" } });
}
