const { execSync } = require('child_process')
const path = require('path')

const extensionDir = path.join(__dirname, '..', 'chrome-extension')
const outputFile  = path.join(__dirname, '..', 'public', 'wheb-crm-extension.zip')

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Compress-Archive -Path '${extensionDir}\\*' -DestinationPath '${outputFile}' -Force"`,
      { stdio: 'inherit' }
    )
  } else {
    execSync(`cd "${extensionDir}" && zip -r "${outputFile}" .`, { stdio: 'inherit' })
  }
  console.log('✓ wheb-crm-extension.zip updated')
} catch (err) {
  console.error('✗ Failed to zip extension:', err.message)
  process.exit(1)
}
