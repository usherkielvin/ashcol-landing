import re
import os

filepath = r"c:\Users\usher\Capstone\ashcol-web-portal\src\pages\DailySalesForm.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# I notice that earlier the regex failed to match onChange={e => ... } because it spanned multiple lines, or because of spacing.
# Actually, the file now has <NumericFormat ... > 
# Let's fix the onChange to onValueChange in those places.

def fix_onchange(match):
    # match is the entire onChange line, e.g.:
    # onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
    full = match.group(0)
    full = full.replace("onChange={e =>", "onValueChange={(values) =>")
    full = full.replace("e.target.value", "values.value")
    return full

content = re.sub(r'onChange=\{e => [^\}]+\bamount:\s*e\.target\.value[^\}]+\}', fix_onchange, content)

# I should also fix the other ones like "total:", "capital:", "salePrice:"?
# Actually, wait, there are other numeric fields in DailySalesForm.tsx:
# capital, salePrice, units
# Let's fix ALL instances where onChange is followed by e => set...(p => p.map(... e.target.value))
# inside a NumericFormat context.

# Let's do a global replace of <input type="number" to <NumericFormat ... onValueChange ... > manually, 
# wait, it's easier to just do it via a more powerful regex.
# Actually, there's another occurrence of e.target.value for quantities in the cash breakdown.

def fix_all_onchange(match):
    full = match.group(0)
    if "NumericFormat" in full or "type=\"number\"" in full:
        pass # we can't tell easily.
    return full

# Let's just fix the exact ones we know we broke by replacing NumericFormat's onChange.
lines = content.split('\n')
for i, line in enumerate(lines):
    if "NumericFormat" in lines[i-1] or "NumericFormat" in line:
        if "onChange={e =>" in line and "e.target.value" in line:
            lines[i] = line.replace("onChange={e =>", "onValueChange={(values) =>").replace("e.target.value", "values.value")

# Wait, what about <input type="number" that wasn't replaced?
# Let's find any remaining <input type="number" and replace them.
for i, line in enumerate(lines):
    if '<input type="number"' in line:
        # replace with NumericFormat
        lines[i] = line.replace('<input type="number"', '<NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false}')
        lines[i] = lines[i].replace('min="0" step="0.01"', '')
        lines[i] = lines[i].replace('min="0"', '') # sometimes no step="0.01"

    # now check if we need to fix the onChange on this line or the next
    if '<NumericFormat' in lines[i] or (i > 0 and '<NumericFormat' in lines[i-1]):
        if 'onChange={e =>' in lines[i] and 'e.target.value' in lines[i]:
            lines[i] = lines[i].replace("onChange={e =>", "onValueChange={(values) =>").replace("e.target.value", "values.value")

content = "\n".join(lines)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed!")
