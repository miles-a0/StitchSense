package com.stitchsense.pro

import android.app.Application

class StitchSenseApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        BillingManager.configure(this)
    }
}
