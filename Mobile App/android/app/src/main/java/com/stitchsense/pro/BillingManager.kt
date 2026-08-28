package com.stitchsense.pro

import android.content.Context
import com.revenuecat.purchases.LogLevel
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.logInWith

object BillingManager {
    val isAvailable: Boolean
        get() = BuildConfig.REVENUECAT_ANDROID_API_KEY.isNotBlank()

    private var configured = false

    fun configure(context: Context) {
        if (!isAvailable || configured) return

        Purchases.logLevel = LogLevel.DEBUG
        Purchases.configure(
            PurchasesConfiguration.Builder(
                context.applicationContext,
                BuildConfig.REVENUECAT_ANDROID_API_KEY
            ).build()
        )
        configured = true
    }

    fun identify(userId: String) {
        if (!configured || userId.isBlank()) return

        Purchases.sharedInstance.logInWith(
            userId,
            {},
            { _, _ -> }
        )
    }
}
