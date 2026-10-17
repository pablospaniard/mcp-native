pluginManagement {
  val androidGradlePluginVersion: String by settings
  val kotlinVersion: String by settings
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
  plugins {
    id("com.android.application") version androidGradlePluginVersion
    id("org.jetbrains.kotlin.android") version kotlinVersion
    id("org.jetbrains.kotlin.plugin.compose") version kotlinVersion
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    maven { url = uri(requireNotNull(System.getenv("MCP_NATIVE_COMPOSE_REPOSITORY"))) }
    google()
    mavenCentral()
  }
}

rootProject.name = "MCPNativeComposeConsumer"
