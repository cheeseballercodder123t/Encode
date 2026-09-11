import pathlib, re
p = pathlib.Path('c:/Users/vinso/Documents/Encode-main/components/AnkiExportModal.tsx')
lines = p.read_text().splitlines()

rs = None
for i, line in enumerate(lines):
    if line.strip() == 'return (' and (len(line) - len(line.lstrip())) == 2:
        rs = i
        break

re_idx = None
for i in range(len(lines) - 1, rs, -1):
    line = lines[i]
    if line.strip() == ');' and (len(line) - len(line.lstrip())) == 2:
        re_idx = i
        break

print(f'Return: L{rs+1} to L{re_idx+1}')

stack = []
for i in range(rs, re_idx + 1):
    line = lines[i]
    s = line.strip()
    ln = i + 1
    opens = list(re.finditer(r"<div\b", s))
    closes = list(re.finditer(r"</div>", s))

    for m in opens:
        after = s[m.end():]
        if (after.startswith('>') or after.startswith(' ')) and not after.startswith('/>'):
            stack.append(ln)

    for m in closes:
        if stack:
            popped = stack.pop()
            if 318 <= ln <= 842:
                print(f'L{ln} CLOSE: popped L{popped} | tail={stack[-3:] if stack else []} | s=|{s[:30]}|')
        else:
            print(f'ERROR L{ln}: extra </div>')

if stack:
    print(f'\nUnclosed ({len(stack)}):')
    for ln in stack:
        print(f'  L{ln}: {lines[ln-1].strip()[:60]}')
else:
    print('\nBalanced!')

