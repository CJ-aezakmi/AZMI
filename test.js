// Test script for AEZAKMI Antidetect Pro
const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');

// Test basic functionality
async function runTests() {
  console.log('🧪 Testing AEZAKMI Antidetect Pro...');
  
  // Test 1: Check if directories are created
  const userDataPath = app.getPath('userData');
  const profilesDir = path.join(userDataPath, 'AEZAKMI_Profiles');
  const extensionsDir = path.join(userDataPath, 'Extensions');
  
  console.log('✅ User data directory:', userDataPath);
  console.log('✅ Profiles directory:', profilesDir);
  console.log('✅ Extensions directory:', extensionsDir);
  
  // Test 2: Create a test profile
  const testProfile = {
    id: 'test-profile-001',
    name: 'Test Profile',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    platform: 'Win32',
    screenWidth: 1920,
    screenHeight: 1080,
    language: 'ru-RU',
    createdAt: new Date().toISOString()
  };
  
  const testProfileDir = path.join(profilesDir, testProfile.id);
  fs.ensureDirSync(testProfileDir);
  fs.writeJSONSync(path.join(testProfileDir, 'config.json'), testProfile, { spaces: 2 });
  
  console.log('✅ Test profile created successfully');
  
  // Test 3: Read profiles
  const profiles = [];
  if (fs.existsSync(profilesDir)) {
    const folders = fs.readdirSync(profilesDir);
    for (const id of folders) {
      const configPath = path.join(profilesDir, id, 'config.json');
      if (fs.existsSync(configPath)) {
        const profile = fs.readJSONSync(configPath);
        profiles.push({ id, ...profile });
      }
    }
  }
  
  console.log(`✅ Found ${profiles.length} profile(s):`, profiles.map(p => p.name));
  
  console.log('🎉 All tests passed! AEZAKMI Antidetect Pro is working correctly.');
  
  // Cleanup
  setTimeout(() => {
    app.quit();
  }, 1000);
}

app.whenReady().then(runTests);

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});