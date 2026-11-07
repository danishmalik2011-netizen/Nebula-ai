plugins {
    id("com.android.application")
}

android {
    namespace = "app.nebula.chat"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.nebula.chat"
        minSdk = 29
        targetSdk = 34
        versionCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "1.0"
        // the address of your deployed Nebula; pass -PappUrl=https://your-site
        val appUrl = ((project.findProperty("appUrl") as String?) ?: "https://example.vercel.app").trimEnd('/')
        buildConfigField("String", "APP_URL", "\"$appUrl/\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        create("release") {
            val path = System.getenv("KEYSTORE_PATH")
            if (path != null && file(path).exists()) {
                storeFile = file(path)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
