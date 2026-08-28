package com.stitchsense.pro

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun WorkspaceShell(api: StitchSenseApi, tokenStore: TokenStore) {
    val scope = rememberCoroutineScope()
    var activePattern by remember { mutableStateOf<PatternSummary?>(null) }
    var status by remember { mutableStateOf("Loading workspace...") }
    var chatPrompt by remember { mutableStateOf("") }
    var chatAnswer by remember { mutableStateOf("") }
    var rewritePrompt by remember { mutableStateOf("") }
    var rewriteAnswer by remember { mutableStateOf("") }
    var chatSession by remember { mutableStateOf<ChatSessionSummary?>(null) }

    LaunchedEffect(Unit) {
        val token = tokenStore.accessToken()
        if (token == null) {
            status = "Sign in again to use Workspace."
            return@LaunchedEffect
        }
        runCatching {
            withContext(Dispatchers.IO) { api.patterns(token) }
        }.onSuccess {
            activePattern = it.firstOrNull()
            status = if (activePattern == null) "Upload or sync a pattern before using Workspace." else ""
        }.onFailure {
            status = "Could not load a pattern for Workspace."
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val pattern = activePattern
        if (pattern == null) {
            FeaturePanel(status)
            return@Column
        }

        FeaturePanel("Active pattern: ${pattern.title}")

        Card(colors = CardDefaults.cardColors(containerColor = StitchSenseColors.Surface)) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Ask StitchSense", fontWeight = FontWeight.Bold, color = StitchSenseColors.Text)
                OutlinedTextField(
                    value = chatPrompt,
                    onValueChange = { chatPrompt = it },
                    label = { Text("Question") },
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        val token = tokenStore.accessToken() ?: return@Button
                        val prompt = chatPrompt.trim()
                        if (prompt.isEmpty()) return@Button
                        scope.launch {
                            chatAnswer = "Thinking..."
                            runCatching {
                                withContext(Dispatchers.IO) {
                                    val session = chatSession ?: api.createChat(token, pattern).also { chatSession = it }
                                    api.sendChatMessage(token, session.id, prompt)
                                }
                            }.onSuccess {
                                chatAnswer = it.content
                                chatPrompt = ""
                            }.onFailure {
                                chatAnswer = "Could not send that question just now."
                            }
                        }
                    }
                ) {
                    Text("Send")
                }
                if (chatAnswer.isNotBlank()) Text(chatAnswer, color = StitchSenseColors.Muted)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = StitchSenseColors.Surface)) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Rewrite", fontWeight = FontWeight.Bold, color = StitchSenseColors.Text)
                OutlinedTextField(
                    value = rewritePrompt,
                    onValueChange = { rewritePrompt = it },
                    label = { Text("Rewrite request") },
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        val token = tokenStore.accessToken() ?: return@Button
                        val prompt = rewritePrompt.trim()
                        if (prompt.isEmpty()) return@Button
                        scope.launch {
                            rewriteAnswer = "Rewriting..."
                            runCatching {
                                withContext(Dispatchers.IO) { api.rewrite(token, pattern, prompt) }
                            }.onSuccess {
                                rewriteAnswer = it.rewriteResult
                                rewritePrompt = ""
                            }.onFailure {
                                rewriteAnswer = "Could not generate that rewrite just now."
                            }
                        }
                    }
                ) {
                    Text("Rewrite")
                }
                if (rewriteAnswer.isNotBlank()) Text(rewriteAnswer, color = StitchSenseColors.Muted)
            }
        }
    }
}

@Composable
fun VisionShell(api: StitchSenseApi, tokenStore: TokenStore) {
    val scope = rememberCoroutineScope()
    var imageDataUri by remember { mutableStateOf("") }
    var result by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FeaturePanel("Paste an image data URI for now. Native photo picking is the next Android pass.")
        OutlinedTextField(
            value = imageDataUri,
            onValueChange = { imageDataUri = it },
            label = { Text("Image data URI") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val token = tokenStore.accessToken() ?: return@Button
                if (imageDataUri.isBlank()) return@Button
                scope.launch {
                    result = "Analysing..."
                    runCatching {
                        withContext(Dispatchers.IO) { api.analyseVision(token, imageDataUri) }
                    }.onSuccess {
                        result = it
                    }.onFailure {
                        result = "Could not analyse that image just now."
                    }
                }
            }
        ) {
            Text("Analyse")
        }
        if (result.isNotBlank()) FeaturePanel(result)
    }
}

@Composable
private fun FeaturePanel(copy: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = StitchSenseColors.Surface)
    ) {
        Text(
            text = copy,
            modifier = Modifier.padding(18.dp),
            color = StitchSenseColors.Muted
        )
    }
}
