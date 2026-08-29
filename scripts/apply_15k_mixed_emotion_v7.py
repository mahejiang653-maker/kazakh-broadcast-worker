from pathlib import Path

# --- 1) Raise frontend text limit to 15,000 ---
page_path = Path('app/page.tsx')
page = page_path.read_text()
page = page.replace('const MAX_CHARACTERS = 6000;', 'const MAX_CHARACTERS = 15000;', 1)
page_path.write_text(page)

# --- 2) Raise synthesis backend text limit to 15,000 ---
route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()
route = route.replace('const MAX_CHARACTERS = 6000;', 'const MAX_CHARACTERS = 15000;', 1)
route_path.write_text(route)

# --- 3) Raise emotion-analysis endpoint limit to 15,000 ---
emotion_api_path = Path('app/api/edge-emotion-analysis/route.ts')
emotion_api = emotion_api_path.read_text()
emotion_api = emotion_api.replace('const MAX_CHARACTERS = 6000;', 'const MAX_CHARACTERS = 15000;', 1)
emotion_api_path.write_text(emotion_api)

# --- 4) Upgrade emotion director with Chinese cues and robust mixed-script signals ---
director_path = Path('app/lib/edge-emotion-director.ts')
director = director_path.read_text()

replacements = {
'''const SERIOUS = [
  "ресми", "мәлімдеді", "хабарлады", "қаулы", "шешім", "заң", "қауіпсіздік",
  "қорғаныс", "келіссөз", "мәжіліс", "жиналыс", "үкімет", "министр", "президент",
  "сот", "тергеу",
];''': '''const SERIOUS = [
  "ресми", "мәлімдеді", "хабарлады", "қаулы", "шешім", "заң", "қауіпсіздік",
  "қорғаныс", "келіссөз", "мәжіліс", "жиналыс", "үкімет", "министр", "президент",
  "сот", "тергеу",
  "官方", "宣布", "表示", "声明", "决定", "法律", "安全", "国防", "谈判", "会议",
  "政府", "部长", "总统", "主席", "法院", "调查", "政策", "外交",
];''',
'''const URGENT = [
  "шұғыл", "төтенше", "жарылыс", "шабуыл", "соққы", "дабыл", "қақтығыс",
  "соғыс", "өрт", "эвакуация", "қауіп төн", "дереу",
];''': '''const URGENT = [
  "шұғыл", "төтенше", "жарылыс", "шабуыл", "соққы", "дабыл", "қақтығыс",
  "соғыс", "өрт", "эвакуация", "қауіп төн", "дереу",
  "紧急", "突发", "爆炸", "袭击", "攻击", "空袭", "警报", "冲突", "战争", "交火",
  "大火", "火灾", "撤离", "疏散", "危险", "立即", "导弹", "无人机",
];''',
'''const SAD = [
  "қаза", "қайтыс", "мерт", "жараланды", "жараланған", "аза", "апат", "құрбан",
  "жоғалды", "үйінді", "қайғ",
];''': '''const SAD = [
  "қаза", "қайтыс", "мерт", "жараланды", "жараланған", "аза", "апат", "құрбан",
  "жоғалды", "үйінді", "қайғ",
  "死亡", "去世", "遇难", "身亡", "伤亡", "受伤", "伤者", "遇难者", "牺牲", "灾难",
  "事故", "失踪", "废墟", "哀悼", "悲痛",
];''',
'''const CONCERN = [
  "алаң", "ескерт", "қауіп", "қиын", "тапшылық", "төменд", "қысым", "шиеленіс",
  "нашар", "зиян", "зардап", "белгісіз",
];''': '''const CONCERN = [
  "алаң", "ескерт", "қауіп", "қиын", "тапшылық", "төменд", "қысым", "шиеленіс",
  "нашар", "зиян", "зардап", "белгісіз",
  "担忧", "担心", "警告", "风险", "危险", "困难", "短缺", "下降", "下跌", "压力",
  "紧张", "恶化", "损失", "损害", "影响", "不确定", "危机",
];''',
'''const POSITIVE = [
  "жеңіс", "жетістік", "өсім", "өсті", "артты", "жақсар", "келісімге кел",
  "қол жеткіз", "қалпына кел", "ашылды", "іске қосылды", "сәтті", "қуанышты",
];''': '''const POSITIVE = [
  "жеңіс", "жетістік", "өсім", "өсті", "артты", "жақсар", "келісімге кел",
  "қол жеткіз", "қалпына кел", "ашылды", "іске қосылды", "сәтті", "қуанышты",
  "胜利", "成功", "增长", "上涨", "上升", "增加", "改善", "达成协议", "达成", "取得",
  "恢复", "开放", "启动", "投入使用", "突破", "创新高", "利好",
];''',
'''const TRANSITION = [
  "бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше", "сонымен қатар",
  "бұдан бөлек", "осы арада", "енді", "нәтижесінде", "сондықтан", "осылайша",
];''': '''const TRANSITION = [
  "бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше", "сонымен қатар",
  "бұдан бөлек", "осы арада", "енді", "нәтижесінде", "сондықтан", "осылайша",
  "但是", "但", "然而", "不过", "尽管如此", "相反", "与此同时", "此外", "另外",
  "另一方面", "因此", "所以", "由此", "结果", "随后", "目前",
];''',
'''const EMPHASIS = [
  "ең бастысы", "маңыздысы", "әсіресе", "атап айтқанда", "алғаш рет", "рекорд",
  "ең жоғары", "ең төмен", "негізгі",
];''': '''const EMPHASIS = [
  "ең бастысы", "маңыздысы", "әсіресе", "атап айтқанда", "алғаш рет", "рекорд",
  "ең жоғары", "ең төмен", "негізгі",
  "最重要", "重要", "尤其", "特别是", "值得注意", "首次", "第一次", "纪录", "创纪录",
  "最高", "最低", "关键", "核心", "重点", "必须指出",
];''',
}

for old, new in replacements.items():
    assert old in director, f'missing cue block: {old[:30]}'
    director = director.replace(old, new, 1)

# Count Chinese numeric expressions and strong punctuation as additional context.
old_numeric = '''  const numeric = (text.match(/[0-9%％]/gu) ?? []).length;

  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };'''
new_numeric = '''  const numeric = (text.match(/[0-9%％]/gu) ?? []).length;
  const hasHan = /\\p{Script=Han}/u.test(text);
  const strongPunctuation = (text.match(/[!！?？]/gu) ?? []).length;

  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };'''
assert old_numeric in director
director = director.replace(old_numeric, new_numeric, 1)

# Let strong Chinese punctuation support urgency/emphasis without making every Chinese sentence dramatic.
old_urgent = '''  if (urgent >= 2 || (urgent >= 1 && role === "climax")) return { mood: "urgent", confidence: 0.88 };'''
new_urgent = '''  if (urgent >= 2 || (urgent >= 1 && role === "climax") || (urgent >= 1 && strongPunctuation >= 1)) {
    return { mood: "urgent", confidence: 0.88 };
  }'''
assert old_urgent in director
director = director.replace(old_urgent, new_urgent, 1)

old_serious = '''  if (serious >= 1 || role === "title" || role === "lead") return { mood: "serious", confidence: 0.64 };'''
new_serious = '''  if (serious >= 1 || role === "title" || role === "lead") {
    return { mood: "serious", confidence: hasHan && serious >= 1 ? 0.7 : 0.64 };
  }'''
assert old_serious in director
director = director.replace(old_serious, new_serious, 1)

director_path.write_text(director)
print('applied 15k text limit and mixed Chinese/Kazakh emotion analysis')
