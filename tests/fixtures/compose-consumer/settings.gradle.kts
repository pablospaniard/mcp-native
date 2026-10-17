pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
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
