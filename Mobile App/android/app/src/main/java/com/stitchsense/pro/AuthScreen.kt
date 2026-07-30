package com.stitchsense.pro

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AuthScreen(
    api: StitchSenseApi,
    tokenStore: TokenStore,
    onSignedIn: (AuthSession) -> Unit
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var registering by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("StitchSense Pro", fontWeight = FontWeight.Bold, color = StitchSenseColors.Primary)
        Text("Your pattern library, AI helper, rewrites, and stitch vision synced everywhere.")

        if (registering) {
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth()
            )
        }
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                scope.launch {
                    error = null
                    runCatching {
                        withContext(Dispatchers.IO) {
                            if (registering) api.register(email, password, displayName) else api.login(email, password)
                        }
                    }.onSuccess {
                        tokenStore.save(it)
                        onSignedIn(it)
                    }.onFailure {
                        error = "Could not sign in. Please try again."
                    }
                }
            }
        ) {
            Text(if (registering) "Start free month" else "Sign in")
        }

        TextButton(onClick = { registering = !registering }) {
            Text(if (registering) "I already have an account" else "Create an account")
        }

        if (error != null) Text(error!!, color = StitchSenseColors.Danger)
    }
}
