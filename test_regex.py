import re
with open('ddg.html', 'r', encoding='utf-8') as f:
    html = f.read()

titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, re.S)
links = re.findall(r'class="result__a"[^>]*href="([^"]+)"', html)
print("Titles:", titles[:2])
print("Links:", links[:2])
