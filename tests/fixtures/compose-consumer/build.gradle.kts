import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  id("com.android.application") version "8.13.2"
  id("org.jetbrains.kotlin.android") version "2.2.20"
  id("org.jetbrains.kotlin.plugin.compose") version "2.2.20"
}

android {
  namespace = "io.github.pablospaniard.mcpnative.compose.consumer"
  compileSdk = 36

  defaultConfig {
    applicationId = "io.github.pablospaniard.mcpnative.compose.consumer"
    minSdk = 33
    targetSdk = 36
    versionCode = 1
    versionName = "1"
  }
  buildFeatures { compose = true }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
  implementation("io.github.pablospaniard:mcp-native-compose:0.0.0-local")
}
