import AppKit
import Foundation

struct Copy {
  let title: String
  let subtitle: String
  let chips: [String]
}

let copies: [String: Copy] = [
  "ko-KR": Copy(
    title: "행복 농장 타이쿤",
    subtitle: "심고 수확하고 연구로 키우는 방치형 농장",
    chips: ["작물 도감", "연구소", "개척·업적"]
  ),
  "en-US": Copy(
    title: "Happy Farm Tycoon",
    subtitle: "Plant, harvest, research, and expand your idle farm",
    chips: ["Collection", "Research Lab", "Pioneer"]
  ),
]

func usage() -> Never {
  fputs(
    "usage: swift scripts/generate-play-feature-graphic.swift <locale> <screenshot.png> <icon.png> <output.png>\n",
    stderr
  )
  exit(2)
}

guard CommandLine.arguments.count == 5 else {
  usage()
}

let locale = CommandLine.arguments[1]
let screenshotPath = CommandLine.arguments[2]
let iconPath = CommandLine.arguments[3]
let outputPath = CommandLine.arguments[4]

guard let copy = copies[locale] else {
  fputs("unsupported locale: \(locale)\n", stderr)
  exit(2)
}
guard let screenshot = NSImage(contentsOfFile: screenshotPath) else {
  fputs("failed to read screenshot: \(screenshotPath)\n", stderr)
  exit(1)
}
guard let icon = NSImage(contentsOfFile: iconPath) else {
  fputs("failed to read icon: \(iconPath)\n", stderr)
  exit(1)
}

let width = 1024
let height = 500
let canvas = NSImage(size: NSSize(width: width, height: height))
canvas.lockFocus()

let bounds = NSRect(x: 0, y: 0, width: width, height: height)
NSColor(calibratedRed: 0.93, green: 0.98, blue: 0.90, alpha: 1).setFill()
bounds.fill()

let gradient = NSGradient(colors: [
  NSColor(calibratedRed: 0.99, green: 0.94, blue: 0.72, alpha: 1),
  NSColor(calibratedRed: 0.82, green: 0.94, blue: 0.78, alpha: 1),
  NSColor(calibratedRed: 0.74, green: 0.89, blue: 0.98, alpha: 1),
])!
gradient.draw(in: bounds, angle: 12)

NSColor(calibratedRed: 0.99, green: 1.0, blue: 0.95, alpha: 0.72).setFill()
NSBezierPath(ovalIn: NSRect(x: -90, y: 315, width: 280, height: 180)).fill()
NSBezierPath(ovalIn: NSRect(x: 425, y: -120, width: 360, height: 220)).fill()

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, color: NSColor) {
  color.setFill()
  NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func drawText(_ text: String, rect: NSRect, size: CGFloat, weight: NSFont.Weight, color: NSColor, lines: Int = 1) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.lineBreakMode = lines == 1 ? .byTruncatingTail : .byWordWrapping
  paragraph.alignment = .left
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: color,
    .paragraphStyle: paragraph,
  ]
  NSString(string: text).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attrs)
}

func drawChip(_ text: String, x: CGFloat, y: CGFloat) -> CGFloat {
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 23, weight: .semibold),
    .foregroundColor: NSColor(calibratedRed: 0.08, green: 0.27, blue: 0.16, alpha: 1),
  ]
  let textSize = NSString(string: text).size(withAttributes: attrs)
  let rect = NSRect(x: x, y: y, width: textSize.width + 34, height: 46)
  drawRoundedRect(rect, radius: 23, color: NSColor(calibratedRed: 0.91, green: 0.98, blue: 0.90, alpha: 1))
  NSColor(calibratedRed: 0.45, green: 0.72, blue: 0.42, alpha: 1).setStroke()
  let border = NSBezierPath(roundedRect: rect, xRadius: 23, yRadius: 23)
  border.lineWidth = 2
  border.stroke()
  NSString(string: text).draw(at: NSPoint(x: x + 17, y: y + 10), withAttributes: attrs)
  return rect.maxX + 14
}

func chipWidth(_ text: String) -> CGFloat {
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 23, weight: .semibold),
  ]
  return NSString(string: text).size(withAttributes: attrs).width + 34
}

let panel = NSRect(x: 54, y: 72, width: 545, height: 356)
drawRoundedRect(panel, radius: 34, color: NSColor.white.withAlphaComponent(0.82))

let iconRect = NSRect(x: 88, y: 286, width: 104, height: 104)
drawRoundedRect(iconRect.insetBy(dx: -8, dy: -8), radius: 30, color: NSColor(calibratedRed: 0.91, green: 0.98, blue: 0.90, alpha: 1))
icon.draw(in: iconRect, from: .zero, operation: .sourceOver, fraction: 1)

drawText(
  copy.title,
  rect: NSRect(x: 210, y: 316, width: 390, height: 58),
  size: locale == "ko-KR" ? 42 : 36,
  weight: .heavy,
  color: NSColor(calibratedRed: 0.08, green: 0.18, blue: 0.12, alpha: 1)
)
drawText(
  copy.subtitle,
  rect: NSRect(x: 88, y: 220, width: 455, height: 70),
  size: locale == "ko-KR" ? 27 : 25,
  weight: .bold,
  color: NSColor(calibratedRed: 0.13, green: 0.39, blue: 0.22, alpha: 1),
  lines: 2
)

var chipX: CGFloat = 88
var chipY: CGFloat = 152
for chip in copy.chips {
  if chipX + chipWidth(chip) > panel.maxX - 38 {
    chipY -= 58
    chipX = 88
  }
  chipX = drawChip(chip, x: chipX, y: chipY)
}

drawText(
  "🌱  💰  🔬  🏆",
  rect: NSRect(x: 88, y: 86, width: 420, height: 50),
  size: 34,
  weight: .bold,
  color: NSColor(calibratedRed: 0.08, green: 0.28, blue: 0.16, alpha: 1)
)

let phoneFrame = NSRect(x: 654, y: 24, width: 280, height: 452)
drawRoundedRect(phoneFrame.insetBy(dx: -13, dy: -13), radius: 36, color: NSColor(calibratedWhite: 0, alpha: 0.10))
drawRoundedRect(phoneFrame.insetBy(dx: -5, dy: -5), radius: 30, color: NSColor.white)

NSGraphicsContext.saveGraphicsState()
NSBezierPath(roundedRect: phoneFrame, xRadius: 26, yRadius: 26).addClip()
let sourceSize = screenshot.size
let sourceRatio = sourceSize.width / sourceSize.height
let frameRatio = phoneFrame.width / phoneFrame.height
var crop = NSRect(origin: .zero, size: sourceSize)
if sourceRatio > frameRatio {
  let cropWidth = sourceSize.height * frameRatio
  crop.origin.x = (sourceSize.width - cropWidth) / 2
  crop.size.width = cropWidth
} else {
  let cropHeight = sourceSize.width / frameRatio
  crop.origin.y = (sourceSize.height - cropHeight) / 2
  crop.size.height = cropHeight
}
screenshot.draw(in: phoneFrame, from: crop, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

NSColor(calibratedRed: 0.31, green: 0.62, blue: 0.35, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 900, y: 360, width: 56, height: 56)).fill()
drawText("★", rect: NSRect(x: 911, y: 369, width: 35, height: 35), size: 28, weight: .black, color: .white)

canvas.unlockFocus()

guard let tiff = canvas.tiffRepresentation,
  let rep = NSBitmapImageRep(data: tiff),
  let png = rep.representation(using: .png, properties: [:])
else {
  fputs("failed to encode png\n", stderr)
  exit(1)
}

try FileManager.default.createDirectory(
  at: URL(fileURLWithPath: outputPath).deletingLastPathComponent(),
  withIntermediateDirectories: true
)
try png.write(to: URL(fileURLWithPath: outputPath))
