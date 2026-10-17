import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "io.github.pablospaniard.mcpnative.compose"
  compileSdk = 36
  buildToolsVersion = "36.0.0"

  defaultConfig {
    minSdk = 33
    consumerProguardFiles("consumer-rules.pro")
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  buildFeatures { compose = true }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  sourceSets.named("main") { assets.srcDir("../src/main/assets") }
  sourceSets.named("androidTest") {
    assets.srcDir("../../../tests/fixtures/renderer-conformance")
  }
  testOptions { unitTests.isIncludeAndroidResources = true }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2025.10.00")
  implementation(composeBom)
  androidTestImplementation(composeBom)
  implementation("androidx.activity:activity-compose:1.12.0")
  implementation("androidx.compose.foundation:foundation")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.javascriptengine:javascriptengine:1.1.0")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20250517")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
  androidTestImplementation("androidx.compose.ui:ui-test-junit4")
  androidTestImplementation("androidx.test.ext:junit:1.3.0")
  androidTestImplementation("androidx.test:runner:1.7.0")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}

