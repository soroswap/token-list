import { getTokenListSchema } from "../src/helpers/token-list-schema"
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "fs"
import Ajv from "ajv"
import { basename } from "path"

const addFormats = require("ajv-formats")

// Custom keyword for minimum value check
function minValueKeyword(min: number) {
  return {
    type: "number",
    validate: function (schema: any, data: any) {
      return data >= min
    },
    message: function (schema: any, data: any) {
      return `Token decimal amount cannot be less than ${min}`
    },
  }
}

// Custom keyword for maximum value check
function maxValueKeyword(max: number) {
  return {
    type: "number",
    validate: function (schema: any, data: any) {
      return data <= max
    },
    message: function (schema: any, data: any) {
      return `Token decimal amount cannot be more than ${max}`
    },
  }
}

// Load the token list JSON schema
const tokenListSchema = getTokenListSchema()

// Add custom keywords to AJV
const ajv = new Ajv({ allErrors: true })
addFormats(ajv)
ajv.addKeyword(minValueKeyword(0))
ajv.addKeyword(maxValueKeyword(18))

// Define paths
const tokenListsDir = "./tokens"
const reportsDir = "./reports"
const reportsFile = `${reportsDir}/report.md`

// Helper to escape backticks in error messages
function escapeBackticks(str: string): string {
  if (str === undefined || str === null) return str
  return str.replace(/`/g, "\\`")
}

// Helper to generate report markdown for a file
function generateReport(file: string, errors: any): string {
  const tokenName = file.split("/").pop()?.split(".")[0]
  let md = `## Token: ${tokenName}\n\n`
  if (errors.length === 0) {
    md += "✅ Valid\n"
  } else {
    md += "❌ Invalid:\n\n"
    md += "| Field | Message |\n"
    md += "|-------|---------|\n"
    errors.forEach((e: any) => {
      const field = escapeBackticks(e.instancePath) || "Root"
      const message = escapeBackticks(e.message)
      md += `| \`${field}\` | ${message} |\n`
    })
    md += "\n"
  }
  return md
}

// Main validation function
export function validate(): void {
  // Ensure reports directory exists
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir)
  }

  const files = readdirSync(tokenListsDir).filter(
    (file: string) => file.endsWith(".json"),
  )

  const validFiles: string[] = []
  const invalidFiles: { file: string; errors: any[] }[] = []

  files.forEach((file: string) => {
    const filePath = `${tokenListsDir}/${file}`
    const fileContent = readFileSync(filePath, "utf-8")
    const token = JSON.parse(fileContent)
    const valid = ajv.validate(tokenListSchema, token)
    const errors = ajv.errors || []

    if (valid) {
      validFiles.push(file)
    } else {
      invalidFiles.push({ file, errors })
    }
  })

  // Generate report
  let md = "# Token Validation Report\n\n"
  md += `**Generated:** ${new Date().toISOString()}\n\n`
  md += `**Total tokens:** ${files.length}\n`
  md += `**Valid:** ${validFiles.length}\n`
  md += `**Invalid:** ${invalidFiles.length}\n\n`
  md += "---\n\n"

  invalidFiles.forEach(({ file, errors }) => {
    md += generateReport(file, errors)
    md += "---\n\n"
  })

  validFiles.forEach((file) => {
    md += generateReport(file, [])
    md += "---\n\n"
  })

  writeFileSync(reportsFile, md)

  if (invalidFiles.length > 0) {
    console.log(
      `${invalidFiles.length} token${invalidFiles.length === 1 ? "" : "s"} have errors`,
    )
    process.exit(1)
  } else {
    console.log(`All ${files.length} token${files.length === 1 ? "" : "s"} valid`)
  }
}

validate()
