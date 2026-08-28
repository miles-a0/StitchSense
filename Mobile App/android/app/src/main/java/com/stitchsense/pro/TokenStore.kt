package com.stitchsense.pro

import android.content.Context

class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("stitchsense-auth", Context.MODE_PRIVATE)

    fun save(session: AuthSession) {
        prefs.edit()
            .putString("accessToken", session.accessToken)
            .putString("refreshToken", session.refreshToken)
            .putString("userId", session.user.id)
            .putString("email", session.user.email)
            .apply()
    }

    fun accessToken(): String? = prefs.getString("accessToken", null)

    fun refreshToken(): String? = prefs.getString("refreshToken", null)

    fun userId(): String? = prefs.getString("userId", null)

    fun email(): String? = prefs.getString("email", null)

    fun clear() {
        prefs.edit().clear().apply()
    }
}
