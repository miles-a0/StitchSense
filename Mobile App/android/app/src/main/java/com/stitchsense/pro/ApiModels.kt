package com.stitchsense.pro

data class AuthUser(
    val id: String,
    val email: String,
    val displayName: String?,
    val role: String
)

data class AuthSession(
    val user: AuthUser,
    val accessToken: String,
    val refreshToken: String
)

data class PatternSummary(
    val id: String,
    val title: String,
    val craftType: String?,
    val originalFilename: String?,
    val source: String
)

data class EntitlementSummary(
    val plan: String,
    val status: String,
    val accessSource: String
)

data class ChatSessionSummary(
    val id: String,
    val patternId: String?,
    val title: String
)

data class ChatMessageSummary(
    val id: Long,
    val role: String,
    val content: String
)

data class RewriteSummary(
    val id: String,
    val patternId: String,
    val rewriteResult: String
)
