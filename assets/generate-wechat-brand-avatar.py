from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 1000
BG = "#F6F8FA"
SLATE = "#5D7389"
WHITE = "#FFFFFF"
PALE = "#DCE6ED"

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "wechat-avatar-yuankun-brand.png"
DESKTOP_OUTPUT = Path.home() / "Desktop" / "公众号头像-源坤房屋.png"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "msyhbd.ttc" if bold else "msyh.ttc"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


image = Image.new("RGB", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(image)

# 圆形品牌底板，兼容微信公众号的圆形头像裁切。
draw.ellipse((70, 70, 930, 930), fill=SLATE)

# 极简屋檐：只保留房产识别符号，不使用复杂楼盘图形。
draw.line((278, 318, 500, 188, 722, 318), fill=WHITE, width=34, joint="curve")
draw.line((350, 305, 350, 352), fill=WHITE, width=28)
draw.line((650, 305, 650, 352), fill=WHITE, width=28)

# 中文品牌名是主视觉，缩小后仍能辨认。
main = "源坤"
main_font = font(178, bold=True)
main_box = draw.textbbox((0, 0), main, font=main_font)
main_w = main_box[2] - main_box[0]
draw.text(((SIZE - main_w) / 2, 350), main, fill=WHITE, font=main_font)

sub = "房 屋"
sub_font = font(76, bold=True)
sub_box = draw.textbbox((0, 0), sub, font=sub_font)
sub_w = sub_box[2] - sub_box[0]
draw.text(((SIZE - sub_w) / 2, 585), sub, fill=PALE, font=sub_font)

draw.rounded_rectangle((350, 716, 650, 724), radius=4, fill=PALE)
latin = "YUAN KUN"
latin_font = font(36, bold=True)
latin_box = draw.textbbox((0, 0), latin, font=latin_font)
latin_w = latin_box[2] - latin_box[0]
draw.text(((SIZE - latin_w) / 2, 752), latin, fill=WHITE, font=latin_font)

image.save(OUTPUT, optimize=True)
image.save(DESKTOP_OUTPUT, optimize=True)
print(OUTPUT)
print(DESKTOP_OUTPUT)
