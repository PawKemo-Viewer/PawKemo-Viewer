// favicon.svg から PWA 用アイコンを生成 (sharp で SVG をラスタライズ)
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const sharp = require("sharp")
import { readFileSync } from "fs"

const svg = readFileSync("public/favicon.svg")

// 角丸ありの 512 / 192
await sharp(svg, { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png")
await sharp(svg, { density: 300 }).resize(192, 192).png().toFile("public/icon-192.png")
console.log("icons generated: public/icon-192.png, public/icon-512.png")
