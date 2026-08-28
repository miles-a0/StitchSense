package com.stitchsense.pro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            StitchSenseApp()
        }
    }
}

private enum class Tab(val title: String) {
    Library("Library"),
    Workspace("Workspace"),
    Camera("Camera"),
    Tools("Tools"),
    Account("Account")
}

@Composable
fun StitchSenseApp() {
    val context = LocalContext.current
    val api = remember { StitchSenseApi() }
    val tokenStore = remember { TokenStore(context) }
    var signedIn by remember { mutableStateOf(tokenStore.accessToken() != null || tokenStore.refreshToken() != null) }
    var selected by remember { mutableStateOf(Tab.Library) }

    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            primary = StitchSenseColors.Primary,
            surface = StitchSenseColors.Surface,
            background = StitchSenseColors.Background,
            onSurface = StitchSenseColors.Text
        )
    ) {
        if (!signedIn) {
            AuthScreen(
                api = api,
                tokenStore = tokenStore,
                onSignedIn = { session ->
                    BillingManager.identify(session.user.id)
                    signedIn = true
                }
            )
        } else {
            LaunchedEffect(Unit) {
                tokenStore.userId()?.let(BillingManager::identify)
            }
            Scaffold(
                bottomBar = {
                    NavigationBar {
                        Tab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = selected == tab,
                                onClick = { selected = tab },
                                icon = {},
                                label = { Text(tab.title) }
                            )
                        }
                    }
                }
            ) { padding ->
                ScreenHost(selected, padding, api = api, tokenStore = tokenStore, onSignOut = {
                    tokenStore.clear()
                    signedIn = false
                    selected = Tab.Library
                })
            }
        }
    }
}

@Composable
private fun ScreenHost(tab: Tab, padding: PaddingValues, api: StitchSenseApi, tokenStore: TokenStore, onSignOut: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(StitchSenseColors.Background)
            .padding(padding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = tab.title,
            style = MaterialTheme.typography.headlineMedium,
            color = StitchSenseColors.Primary,
            fontWeight = FontWeight.Bold
        )

        when (tab) {
            Tab.Library -> LibraryShell(api, tokenStore)
            Tab.Workspace -> WorkspaceShell(api, tokenStore)
            Tab.Camera -> VisionShell(api, tokenStore)
            Tab.Tools -> FeatureCard("Gauge tools and compact calculators will sit here for quick mobile use.")
            Tab.Account -> AccountShell(api, tokenStore, onSignOut)
        }
    }
}

@Composable
private fun LibraryShell(api: StitchSenseApi, tokenStore: TokenStore) {
    var patterns by remember { mutableStateOf<List<PatternSummary>>(emptyList()) }
    var status by remember { mutableStateOf("Loading your library...") }

    LaunchedEffect(Unit) {
        val token = tokenStore.accessToken()
        if (token == null) {
            status = "Sign in again to load your library."
            return@LaunchedEffect
        }
        runCatching {
            withContext(Dispatchers.IO) { api.patterns(token) }
        }.onSuccess {
            patterns = it
            status = if (it.isEmpty()) "No patterns yet. Upload from iOS or web to start syncing." else ""
        }.onFailure {
            status = "Could not load your library."
        }
    }

    if (patterns.isEmpty()) {
        FeatureCard(status)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            patterns.forEach { pattern ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = StitchSenseColors.Surface)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(pattern.title, fontWeight = FontWeight.Bold, color = StitchSenseColors.Text)
                        Text(pattern.craftType ?: pattern.source, color = StitchSenseColors.Muted)
                        if (pattern.originalFilename != null) Text(pattern.originalFilename, color = StitchSenseColors.Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun FeatureCard(copy: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = StitchSenseColors.Surface)
    ) {
        Text(
            text = copy,
            modifier = Modifier.padding(18.dp),
            color = StitchSenseColors.Muted,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

@Composable
private fun AccountShell(api: StitchSenseApi, tokenStore: TokenStore, onSignOut: () -> Unit) {
    var entitlement by remember { mutableStateOf<EntitlementSummary?>(null) }
    var status by remember { mutableStateOf("Checking subscription...") }

    LaunchedEffect(Unit) {
        val token = tokenStore.accessToken()
        if (token == null) {
            status = "Sign in again to check your subscription."
            return@LaunchedEffect
        }
        runCatching {
            withContext(Dispatchers.IO) { api.entitlement(token) }
        }.onSuccess {
            entitlement = it
            status = entitlementCopy(it)
        }.onFailure {
            status = "Could not check subscription status."
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        FeatureCard("Signed in as ${tokenStore.email() ?: "StitchSense user"}")
        FeatureCard(status)
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onSignOut
        ) {
            Text("Sign out")
        }
    }
}

private fun entitlementCopy(entitlement: EntitlementSummary): String {
    return when (entitlement.accessSource) {
        "manual_lifetime" -> "Lifetime Pro access is active."
        "manual_trial", "courtesy_access" -> "Complimentary Pro access is active."
        "stripe", "apple", "google" -> "Your Pro subscription is active."
        "standard_trial" -> "Your free trial is active."
        else -> "Your free access has ended. Subscribe to continue."
    }
}

object StitchSenseColors {
    val Background = Color(0xFFFFF7EF)
    val Surface = Color(0xFFFFFFFF)
    val Text = Color(0xFF2B1F1A)
    val Muted = Color(0xFF755F55)
    val Primary = Color(0xFF6F3F25)
    val Danger = Color(0xFFB84A3F)
}
