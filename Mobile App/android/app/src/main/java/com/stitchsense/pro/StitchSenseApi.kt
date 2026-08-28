package com.stitchsense.pro

import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class StitchSenseApi(
    private val baseUrl: String = "http://10.0.2.2:8080"
) {
    fun login(email: String, password: String): AuthSession {
        val json = JSONObject()
            .put("email", email)
            .put("password", password)
        val response = post("/auth/login", json)
        return response.toAuthSession()
    }

    fun register(email: String, password: String, displayName: String): AuthSession {
        val json = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("displayName", displayName)
        val response = post("/auth/register", json)
        return response.toAuthSession()
    }

    fun refresh(refreshToken: String): AuthSession {
        val json = JSONObject().put("refreshToken", refreshToken)
        val response = post("/auth/refresh", json)
        return response.toAuthSession()
    }

    fun patterns(accessToken: String): List<PatternSummary> {
        val response = get("/patterns", accessToken)
        val items = response.getJSONArray("patterns")
        return buildList {
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                add(
                    PatternSummary(
                        id = item.getString("id"),
                        title = item.optString("title", "Untitled"),
                        craftType = item.optString("craft_type").ifBlank { item.optString("craftType").ifBlank { null } },
                        originalFilename = item.optString("original_filename").ifBlank { item.optString("originalFilename").ifBlank { null } },
                        source = item.optString("source", "upload")
                    )
                )
            }
        }
    }

    fun entitlement(accessToken: String): EntitlementSummary {
        val response = get("/me/entitlements", accessToken).getJSONObject("entitlement")
        return EntitlementSummary(
            plan = response.optString("plan", "none"),
            status = response.optString("status", "expired"),
            accessSource = response.optString("accessSource", "none")
        )
    }

    fun createChat(accessToken: String, pattern: PatternSummary): ChatSessionSummary {
        val response = post(
            "/chats",
            JSONObject()
                .put("patternId", pattern.id)
                .put("title", pattern.title)
                .put("skillLevel", "beginner"),
            accessToken
        ).getJSONObject("session")
        return ChatSessionSummary(
            id = response.getString("id"),
            patternId = response.optString("pattern_id").ifBlank { response.optString("patternId").ifBlank { null } },
            title = response.optString("title", pattern.title)
        )
    }

    fun sendChatMessage(accessToken: String, sessionId: String, content: String): ChatMessageSummary {
        val response = post(
            "/chats/$sessionId/messages",
            JSONObject()
                .put("content", content)
                .put("kind", "message")
                .put("toolMode", "pattern_chat"),
            accessToken
        ).getJSONObject("message")
        return ChatMessageSummary(
            id = response.optLong("id"),
            role = response.optString("role", "assistant"),
            content = response.optString("content")
        )
    }

    fun rewrite(accessToken: String, pattern: PatternSummary, prompt: String): RewriteSummary {
        val response = post(
            "/rewrites",
            JSONObject()
                .put("patternId", pattern.id)
                .put("prompt", prompt),
            accessToken
        ).getJSONObject("rewrite")
        return RewriteSummary(
            id = response.getString("id"),
            patternId = response.optString("pattern_id").ifBlank { response.optString("patternId", pattern.id) },
            rewriteResult = response.optString("rewrite_result").ifBlank { response.optString("rewriteResult") }
        )
    }

    fun analyseVision(accessToken: String, imageDataUri: String): String {
        val response = post(
            "/vision/analyse",
            JSONObject().put("imageDataUri", imageDataUri),
            accessToken
        )
        return response.opt("result")?.toString() ?: response.toString()
    }

    private fun get(path: String, accessToken: String? = null): JSONObject {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("accept", "application/json")
            if (accessToken != null) setRequestProperty("authorization", "Bearer $accessToken")
        }
        return connection.readJson()
    }

    private fun post(path: String, body: JSONObject, accessToken: String? = null): JSONObject {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("accept", "application/json")
            setRequestProperty("content-type", "application/json")
            if (accessToken != null) setRequestProperty("authorization", "Bearer $accessToken")
            doOutput = true
        }
        OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }
        return connection.readJson()
    }
}

private fun HttpURLConnection.readJson(): JSONObject {
    val stream = if (responseCode in 200..299) inputStream else errorStream
    val text = BufferedReader(stream.reader()).use { it.readText() }
    if (responseCode !in 200..299) throw IllegalStateException(text)
    return JSONObject(text)
}

private fun JSONObject.toAuthSession(): AuthSession {
    val userJson = getJSONObject("user")
    return AuthSession(
        user = AuthUser(
            id = userJson.getString("id"),
            email = userJson.getString("email"),
            displayName = userJson.optString("display_name").ifBlank { userJson.optString("displayName").ifBlank { null } },
            role = userJson.getString("role")
        ),
        accessToken = getString("accessToken"),
        refreshToken = getString("refreshToken")
    )
}
