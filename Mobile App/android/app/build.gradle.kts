plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val revenueCatAndroidApiKey = providers.gradleProperty("REVENUECAT_ANDROID_API_KEY").orElse("").get()
val revenueCatEntitlementId = providers.gradleProperty("REVENUECAT_ENTITLEMENT_ID").orElse("pro").get()

android {
    namespace = "com.stitchsense.pro"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.stitchsense.pro"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "REVENUECAT_ANDROID_API_KEY", "\"$revenueCatAndroidApiKey\"")
        buildConfigField("String", "REVENUECAT_ENTITLEMENT_ID", "\"$revenueCatEntitlementId\"")
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.revenuecat.purchases:purchases:9.23.1")
    implementation("com.revenuecat.purchases:purchases-ui:9.23.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
