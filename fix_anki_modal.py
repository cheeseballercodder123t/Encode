import pathlib

p = pathlib.Path('c:/Users/vinso/Documents/Encode-main/components/AnkiExportModal.tsx')
lines = p.read_text().splitlines(keepends=True)

# Fix 1: remove garbage )}\n at line 634 (index 633)
# Lines 631-634 (0-indexed 630-633):
#  L631: "                </div>\n"  (16 spaces)
#  L632: "              )}\n"       (14 spaces)
#  L633: "            </div>\n"     (12 spaces)
#  L634: "          )}\n"          (10 spaces) <-- GARBAGE, remove
# After removal: L633's </div> is the last line before the empty line and TAB 2 comment

# Verify the lines before editing
assert lines[630].rstrip('\n') == '                </div>', f'L631 mismatch: {lines[630]!r}'
assert lines[631].rstrip('\n') == '              )}', f'L632 mismatch: {lines[631]!r}'
assert lines[632].rstrip('\n') == '            </div>', f'L633 mismatch: {lines[632]!r}'
assert lines[633].rstrip('\n') == '          )}', f'L634 mismatch: {lines[633]!r}'

# Remove the garbage line 634 (index 633)
del lines[633]

# Now line 829 (original index) is now at 828 (after deletion shifts everything up by 1)
# Find the {/* Modal Footer */} comment and wrap it
for i, line in enumerate(lines):
    if '/* Modal Footer */' in line and '{/*' not in line:
        old = line
        new = line.replace('/* Modal Footer */', '{/* Modal Footer */}')
        lines[i] = new
        print(f'Fixed line {i+1}: {old.strip()!r} -> {new.strip()!r}')
        break

p.write_text(''.join(lines))
print('Done. File updated.')
