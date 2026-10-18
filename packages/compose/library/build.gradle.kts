import org.gradle.api.publish.maven.MavenPublication
import org.gradle.api.publish.tasks.GenerateModuleMetadata
import org.gradle.jvm.tasks.Jar
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  `maven-publish`
}

group = "io.github.pablospaniard"
version = providers.gradleProperty("mcpNativeVersion").orElse("0.0.0-local").get()

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
  publishing {
    singleVariant("release") { withSourcesJar() }
  }
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
  api("androidx.compose.ui:ui")
  implementation("androidx.javascriptengine:javascriptengine:1.1.0")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
  api("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20250517")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
  androidTestImplementation("androidx.compose.ui:ui-test-junit4")
  androidTestImplementation("androidx.test.ext:junit:1.3.0")
  androidTestImplementation("androidx.test:runner:1.7.0")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}

val documentationFile = layout.projectDirectory.file("../README.md")
val javadocJar by tasks.registering(Jar::class) {
  archiveClassifier.set("javadoc")
  from(documentationFile)
  doFirst {
    check(documentationFile.asFile.isFile) {
      "Compose documentation is required for the Maven javadoc artifact"
    }
  }
}

afterEvaluate {
  publishing {
    publications {
      register<MavenPublication>("release") {
        from(components["release"])
        artifactId = "mcp-native-compose"
        artifact(javadocJar)

        pom {
          name.set("MCP Native Compose")
          description.set("Fail-closed Jetpack Compose renderer for MCP Native's pinned A2UI profile.")
          url.set("https://github.com/pablospaniard/mcp-native")
          licenses {
            license {
              name.set("MIT License")
              url.set("https://opensource.org/license/mit")
              distribution.set("repo")
            }
          }
          developers {
            developer {
              id.set("pablospaniard")
              name.set("Pavel Ivanov")
              url.set("https://github.com/pablospaniard")
            }
          }
          scm {
            connection.set("scm:git:git://github.com/pablospaniard/mcp-native.git")
            developerConnection.set("scm:git:ssh://git@github.com/pablospaniard/mcp-native.git")
            url.set("https://github.com/pablospaniard/mcp-native")
          }
          issueManagement {
            system.set("GitHub")
            url.set("https://github.com/pablospaniard/mcp-native/issues")
          }
        }
      }
    }
    repositories {
      maven {
        name = "releaseBundle"
        url = layout.buildDirectory.dir("maven-repository").get().asFile.toURI()
      }
    }
  }
}

// Maven Central requires every deployed file to have a detached PGP signature. Publish the
// portable POM rather than Gradle-only module metadata; trusted release automation signs it.
tasks.withType<GenerateModuleMetadata>().configureEach { enabled = false }

