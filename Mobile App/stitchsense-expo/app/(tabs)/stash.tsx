import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppCard } from '@/src/components/ui/app-card';
import { BrandButton } from '@/src/components/ui/brand-button';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { describeStashItem, ravelryWeightForStash, stashIdeaSuggestions } from '@/src/lib/stash-insights';
import type { StashCategory, StashItem } from '@/src/lib/stash-store';
import { useProjects } from '@/src/providers/projects-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { shadows, tokens } from '@/src/theme/tokens';

type StashFilter = StashCategory | 'all' | 'reserved' | 'available' | 'needs-detail' | 'missing-photo' | 'low-stock';

const categories: { id: StashFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'yarn', label: 'Yarn' },
  { id: 'needle-hook', label: 'Needles & hooks' },
  { id: 'tool', label: 'Tools' },
  { id: 'reserved', label: 'Reserved' },
  { id: 'available', label: 'Available' },
  { id: 'needs-detail', label: 'Needs details' },
  { id: 'low-stock', label: 'Low stock' },
];

const stashCategoryOptions = categories.filter((entry): entry is { id: StashCategory; label: string } =>
  ['yarn', 'needle-hook', 'tool'].includes(entry.id),
);

const yarnQuickFills = [
  { label: 'Sock 100g', weight: '4 ply / sock', quantity: '100', unit: 'g' },
  { label: 'DK 100g', weight: 'DK', quantity: '100', unit: 'g' },
  { label: 'Aran 200g', weight: 'Aran', quantity: '200', unit: 'g' },
  { label: 'Bulky 200g', weight: 'Bulky', quantity: '200', unit: 'g' },
] as const;

const toolQuickFills = [
  { label: '4mm circular', category: 'needle-hook' as const, size: '4mm', material: 'circular needle' },
  { label: '5mm hook', category: 'needle-hook' as const, size: '5mm', material: 'crochet hook' },
  { label: 'Markers', category: 'tool' as const, size: '', material: 'stitch markers' },
] as const;

const categoryLabels: Record<StashCategory, string> = {
  yarn: 'Yarn',
  'needle-hook': 'Needle/Hook',
  tool: 'Tool',
};

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function itemSummary(item: StashItem) {
  const quantity = item.quantity && item.unit ? `${item.quantity}${item.unit}` : item.quantity;
  const details =
    item.category === 'yarn'
      ? [quantity, item.yarnWeight, item.colour, item.fibre, item.brand]
      : [item.size, item.material, item.brand, item.location];
  const summary = details.filter(Boolean).join(' - ');
  return summary || item.notes || 'Ready to use.';
}

function numericQuantity(item: StashItem) {
  if (!item.quantity) {
    return null;
  }
  const parsed = Number(item.quantity);
  return Number.isFinite(parsed) ? parsed : null;
}

function quickUseAmount(item: StashItem) {
  const amount = numericQuantity(item);
  if (amount === null || amount <= 0) {
    return null;
  }

  const unit = item.unit?.trim().toLowerCase() ?? '';
  if (unit === 'g' || unit === 'gram' || unit === 'grams') {
    if (amount >= 50) return 25;
    if (amount >= 20) return 10;
    return 5;
  }
  if (unit.includes('skein') || unit.includes('ball') || unit.includes('hank')) {
    return 1;
  }
  return 1;
}

function needsMoreDetail(item: StashItem) {
  if (item.category === 'yarn') {
    return !item.quantity || !item.unit || !item.yarnWeight || !item.colour;
  }
  return !item.size && !item.material && !item.notes;
}

function isLowStock(item: StashItem) {
  const quantity = numericQuantity(item);
  if (quantity === null) {
    return false;
  }
  const unit = item.unit?.trim().toLowerCase() ?? '';
  if (unit === 'g' || unit === 'gram' || unit === 'grams') {
    return quantity > 0 && quantity <= 25;
  }
  if (unit.includes('skein') || unit.includes('ball') || unit.includes('hank')) {
    return quantity > 0 && quantity <= 1;
  }
  return quantity > 0 && quantity <= 1;
}

export default function StashScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { accessToken } = useSession();
  const { items, addItem, updateItem, removeItem } = useStash();
  const { projects } = useProjects();
  const scrollRef = useRef<ScrollView>(null);
  const [category, setCategory] = useState<StashCategory>('yarn');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showStashForm, setShowStashForm] = useState(false);
  const [filter, setFilter] = useState<StashFilter>('all');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');
  const [brand, setBrand] = useState('');
  const [yarnWeight, setYarnWeight] = useState('');
  const [fibre, setFibre] = useState('');
  const [colour, setColour] = useState('');
  const [dyeLot, setDyeLot] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [location, setLocation] = useState('');
  const [reservedFor, setReservedFor] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Start with the yarn and tools you reach for most often.',
  );
  const [expandedIdeasFor, setExpandedIdeasFor] = useState<string | null>(null);

  const yarnItems = items.filter((item) => item.category === 'yarn').length;
  const equipmentItems = items.length - yarnItems;
  const activeProjects = projects.filter((project) => project.status === 'active').slice(0, 4);
  const stashCardWidth = Math.max(280, width - tokens.spacing.lg * 2);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all') {
        if (filter === 'reserved' && !item.reservedFor) return false;
        if (filter === 'available' && item.reservedFor) return false;
        if (filter === 'needs-detail' && !needsMoreDetail(item)) return false;
        if (filter === 'missing-photo' && item.imageUri) return false;
        if (filter === 'low-stock' && !isLowStock(item)) return false;
        if (
          ['yarn', 'needle-hook', 'tool'].includes(filter) &&
          item.category !== filter
        ) {
          return false;
        }
      }
      if (!needle) {
        return true;
      }
      return [
        item.name,
        item.brand,
        item.yarnWeight,
        item.fibre,
        item.colour,
        item.dyeLot,
        item.size,
        item.material,
        item.location,
        item.reservedFor,
        item.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, items, query]);
  const projectsByTitle = useMemo(() => {
    return new Map(projects.map((project) => [project.title.trim().toLowerCase(), project.id]));
  }, [projects]);
  const reservedItems = useMemo(
    () => items.filter((item) => Boolean(item.reservedFor)),
    [items],
  );
  const availableItems = useMemo(
    () => items.filter((item) => !item.reservedFor),
    [items],
  );
  const needsDetailCount = useMemo(
    () => items.filter(needsMoreDetail).length,
    [items],
  );
  const lowStockCount = useMemo(
    () => items.filter(isLowStock).length,
    [items],
  );
  const ideaReadyItem = useMemo(
    () =>
      items.find((item) => item.category === 'yarn' && !item.reservedFor) ??
      items.find((item) => !item.reservedFor) ??
      null,
    [items],
  );
  const projectReadyStashItem = useMemo(
    () =>
      items.find((item) => {
        if (item.category !== 'yarn' || item.reservedFor) return false;
        const quantity = numericQuantity(item);
        if (quantity === null) return false;
        const unit = item.unit?.trim().toLowerCase() ?? '';
        if (unit === 'g' || unit === 'gram' || unit === 'grams') return quantity >= 50;
        if (unit.includes('skein') || unit.includes('ball') || unit.includes('hank')) return quantity >= 1;
        return quantity >= 1;
      }) ?? null,
    [items],
  );
  const needsDetailItem = useMemo(
    () =>
      items.find((item) => !item.quantity && item.category === 'yarn') ??
      items.find((item) => !item.imageUri && !item.notes) ??
      null,
    [items],
  );
  const stashFocusCards = [
    reservedItems[0]
      ? {
          icon: 'basket-check-outline' as const,
          title: 'Reserved for a project',
          copy: `${reservedItems[0].name} is set aside for ${reservedItems[0].reservedFor}.`,
          action: 'Open',
          onPress: () => openReservedProject(reservedItems[0]),
        }
      : null,
    ideaReadyItem
      ? {
          icon: 'lightbulb-on-outline' as const,
          title: 'Ready for ideas',
          copy: `Ask what ${describeStashItem(ideaReadyItem)} could become.`,
          action: 'Ask',
          onPress: () => askForIdeas(ideaReadyItem),
        }
      : null,
    needsDetailItem
      ? {
          icon: 'pencil-outline' as const,
          title: 'Improve this record',
          copy: `${needsDetailItem.name} would be more useful with quantity, notes, or a photo.`,
          action: 'Edit',
          onPress: () => startEdit(needsDetailItem),
        }
      : null,
  ].filter((card): card is NonNullable<typeof card> => Boolean(card));
  const activeFilterLabel =
    categories.find((entry) => entry.id === filter)?.label ?? 'All';
  const editingItem = editingItemId ? items.find((item) => item.id === editingItemId) ?? null : null;

  function resetForm(nextCategory: StashCategory = 'yarn') {
    setEditingItemId(null);
    setShowStashForm(false);
    setCategory(nextCategory);
    setName('');
    setQuantity('');
    setUnit(nextCategory === 'yarn' ? 'g' : '');
    setBrand('');
    setYarnWeight('');
    setFibre('');
    setColour('');
    setDyeLot('');
    setSize('');
    setMaterial('');
    setLocation('');
    setReservedFor('');
    setNotes('');
    setImageUri(null);
  }

  function applyYarnQuickFill(preset: (typeof yarnQuickFills)[number]) {
    setCategory('yarn');
    setYarnWeight(preset.weight);
    setQuantity((current) => current || preset.quantity);
    setUnit(preset.unit);
    setStatusMessage(`${preset.label} details added. Add a name, colour, or photo when ready.`);
  }

  function applyToolQuickFill(preset: (typeof toolQuickFills)[number]) {
    setCategory(preset.category);
    setSize(preset.size);
    setMaterial(preset.material);
    setUnit('');
    setStatusMessage(`${preset.label} details added. Add a name or storage location when ready.`);
  }

  function reserveForProject(title: string) {
    setReservedFor(title);
    setStatusMessage(`Reservation set for ${title}. Save the stash item to keep it.`);
  }

  function startEdit(item: StashItem) {
    setEditingItemId(item.id);
    setShowStashForm(true);
    setCategory(item.category);
    setName(item.name);
    setQuantity(item.quantity ?? '');
    setUnit(item.unit ?? (item.category === 'yarn' ? 'g' : ''));
    setBrand(item.brand ?? '');
    setYarnWeight(item.yarnWeight ?? '');
    setFibre(item.fibre ?? '');
    setColour(item.colour ?? '');
    setDyeLot(item.dyeLot ?? '');
    setSize(item.size ?? '');
    setMaterial(item.material ?? '');
    setLocation(item.location ?? '');
    setReservedFor(item.reservedFor ?? '');
    setNotes(item.notes ?? '');
    setImageUri(item.imageUri ?? null);
    setStatusMessage(`Editing ${item.name}.`);
  }

  async function pickImage(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo access is needed to attach a stash image.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.78,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.78,
          });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleSaveItem() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatusMessage('Give this stash item a name first.');
      return;
    }

    const payload = {
      category,
      name: trimmedName,
      quantity: optional(quantity),
      unit: optional(unit),
      brand: optional(brand),
      yarnWeight: optional(yarnWeight),
      fibre: optional(fibre),
      colour: optional(colour),
      dyeLot: optional(dyeLot),
      size: optional(size),
      material: optional(material),
      location: optional(location),
      reservedFor: optional(reservedFor),
      notes: optional(notes),
      imageUri: imageUri ?? undefined,
    };

    if (editingItemId) {
      await updateItem(editingItemId, payload);
      setStatusMessage(`${trimmedName} updated.`);
      resetForm();
      return;
    }

    const saved = await addItem(payload);

    if (saved) {
      setStatusMessage(`${saved.name} added to your stash.`);
      resetForm();
    }
  }

  function handleRemoveItem(item: StashItem) {
    Alert.alert('Remove stash item?', `Remove ${item.name} from your stash?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeItem(item.id);
          setStatusMessage(`${item.name} removed.`);
        },
      },
    ]);
  }

  function handleRemoveEditingItem() {
    if (!editingItem) {
      return;
    }

    Alert.alert('Delete stash item?', `Delete ${editingItem.name} from your stash?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeItem(editingItem.id);
          setStatusMessage(`${editingItem.name} deleted.`);
          resetForm();
        },
      },
    ]);
  }

  async function handleUseSome(item: StashItem) {
    const currentQuantity = numericQuantity(item);
    const amount = quickUseAmount(item);
    if (currentQuantity === null || amount === null) {
      startEdit(item);
      setStatusMessage(`Edit ${item.name} to adjust its quantity.`);
      return;
    }

    const nextQuantity = Math.max(0, currentQuantity - amount);
    await updateItem(item.id, { quantity: String(nextQuantity) });
    setStatusMessage(
      `${item.name} reduced by ${amount}${item.unit ? ` ${item.unit}` : ''}.`,
    );
  }

  async function handleClearReservation(item: StashItem) {
    await updateItem(item.id, { reservedFor: undefined });
    setStatusMessage(`${item.name} is no longer reserved.`);
  }

  function openReservedProject(item: StashItem) {
    const projectId = item.reservedFor
      ? projectsByTitle.get(item.reservedFor.trim().toLowerCase())
      : null;
    if (!projectId) {
      setStatusMessage('That reserved project is not in this app yet.');
      return;
    }

    router.push({ pathname: '/project/[id]', params: { id: projectId } });
  }

  function askForIdeas(item: StashItem) {
    router.push({
      pathname: '/(tabs)/chat',
      params: {
        prompt: `What could I make with ${describeStashItem(item)}? Please suggest practical knitting or crochet ideas, including any extra materials I might need.`,
      },
    });
  }

  function openRavelryIdeas(item: StashItem, idea: string) {
    const queryParts = [idea, item.colour, item.fibre].filter(Boolean);
    router.push({
      pathname: '/ravelry',
      params: {
        q: queryParts.join(' '),
        weight: ravelryWeightForStash(item),
        pageSize: '10',
        autoRun: '1',
        source: 'stash',
        stashId: item.id,
        stashName: item.name,
        idea,
      },
    });
  }

  function stashImageSource(item: StashItem) {
    if (!item.imageUri) {
      return null;
    }

    const isProtectedApiImage = item.imageUri.includes('/stash/') && item.imageUri.endsWith('/image');
    return {
      uri: item.imageUri,
      ...(isProtectedApiImage && accessToken
        ? { headers: { authorization: `Bearer ${accessToken}` } }
        : {}),
    };
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} style={styles.screen}>
      <ScreenHero
        copy="Keep yarn, hooks, needles, and useful kit in one calm place so StitchSense can help you choose projects with what you already own."
        eyebrow="Stash"
        icon="basket-outline"
        title="Your making supplies, remembered">
        <View style={styles.heroStats}>
          <Pressable onPress={() => setFilter('yarn')} style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{yarnItems}</Text>
            <Text style={styles.heroStatLabel}>Yarns</Text>
          </Pressable>
          <Pressable onPress={() => setFilter('tool')} style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{equipmentItems}</Text>
            <Text style={styles.heroStatLabel}>Tools</Text>
          </Pressable>
          <Pressable onPress={() => setFilter('available')} style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{availableItems.length}</Text>
            <Text style={styles.heroStatLabel}>Available</Text>
          </Pressable>
        </View>
      </ScreenHero>

      <View style={styles.heroActions}>
        <BrandButton
          label="Add item"
          onPress={() => {
            resetForm();
            setShowStashForm(true);
          }}
          style={styles.fullWidth}
        />
        {ideaReadyItem ? (
          <BrandButton
            label="Ask for ideas"
            onPress={() => askForIdeas(ideaReadyItem)}
            style={styles.fullWidth}
            variant="ghost"
          />
        ) : null}
      </View>

      <Modal
        animationType="slide"
        visible={showStashForm || Boolean(editingItemId)}
        onRequestClose={() => resetForm()}>
        <View style={styles.formModalScreen}>
          <ScrollView contentContainerStyle={styles.formModalContent}>
            <AppCard elevated style={styles.formCard}>
              <View style={styles.formModalHeader}>
                <View style={styles.formModalTitleBlock}>
                  <Text style={styles.sectionEyebrow}>Stash item</Text>
                  <Text style={styles.sectionTitle}>
                    {editingItemId ? 'Update this stash item' : 'Record what you already have'}
                  </Text>
                </View>
                <Pressable onPress={() => resetForm()} style={styles.formModalClose}>
                  <MaterialCommunityIcons color={tokens.color.primary} name="close" size={20} />
                </Pressable>
              </View>
        <View style={styles.segmentRow}>
          {stashCategoryOptions.map((entry) => {
              const active = category === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    setCategory(entry.id);
                    setUnit(entry.id === 'yarn' ? 'g' : '');
                  }}
                  style={[styles.segment, active ? styles.segmentActive : null]}>
                  <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        <View style={styles.quickFillPanel}>
          <Text style={styles.quickFillTitle}>Quick fill</Text>
          <View style={styles.quickFillRow}>
            {yarnQuickFills.map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => applyYarnQuickFill(preset)}
                style={styles.quickFillChip}>
                <Text style={styles.quickFillChipText}>{preset.label}</Text>
              </Pressable>
            ))}
            {toolQuickFills.map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => applyToolQuickFill(preset)}
                style={styles.quickFillChip}>
                <Text style={styles.quickFillChipText}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <TextInput
          onChangeText={setName}
          placeholder={category === 'yarn' ? 'Blue hand-dyed Gotland DK' : '4mm circular needle'}
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={name}
        />

        <View style={styles.twoColumn}>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setQuantity}
            placeholder="Quantity"
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.flexInput]}
            value={quantity}
          />
          <TextInput
            onChangeText={setUnit}
            placeholder="Unit"
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.flexInput]}
            value={unit}
          />
        </View>

        {category === 'yarn' ? (
          <>
            <View style={styles.twoColumn}>
              <TextInput
                onChangeText={setBrand}
                placeholder="Brand / dyer"
                placeholderTextColor="#9b867d"
                style={[styles.input, styles.flexInput]}
                value={brand}
              />
              <TextInput
                onChangeText={setYarnWeight}
                placeholder="Weight"
                placeholderTextColor="#9b867d"
                style={[styles.input, styles.flexInput]}
                value={yarnWeight}
              />
            </View>
            <View style={styles.twoColumn}>
              <TextInput
                onChangeText={setFibre}
                placeholder="Fibre"
                placeholderTextColor="#9b867d"
                style={[styles.input, styles.flexInput]}
                value={fibre}
              />
              <TextInput
                onChangeText={setColour}
                placeholder="Colour"
                placeholderTextColor="#9b867d"
                style={[styles.input, styles.flexInput]}
                value={colour}
              />
            </View>
            <TextInput
              onChangeText={setDyeLot}
              placeholder="Dye lot / batch"
              placeholderTextColor="#9b867d"
              style={styles.input}
              value={dyeLot}
            />
          </>
        ) : (
          <View style={styles.twoColumn}>
            <TextInput
              onChangeText={setSize}
              placeholder="Size"
              placeholderTextColor="#9b867d"
              style={[styles.input, styles.flexInput]}
              value={size}
            />
            <TextInput
              onChangeText={setMaterial}
              placeholder="Material"
              placeholderTextColor="#9b867d"
              style={[styles.input, styles.flexInput]}
              value={material}
            />
          </View>
        )}

        <View style={styles.twoColumn}>
          <TextInput
            onChangeText={setLocation}
            placeholder="Where is it stored?"
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.flexInput]}
            value={location}
          />
          <TextInput
            onChangeText={setReservedFor}
            placeholder="Reserved for"
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.flexInput]}
            value={reservedFor}
          />
        </View>

        {activeProjects.length > 0 ? (
          <View style={styles.reserveShortcutPanel}>
            <Text style={styles.quickFillTitle}>Reserve for active project</Text>
            <View style={styles.quickFillRow}>
              {activeProjects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => reserveForProject(project.title)}
                  style={[
                    styles.quickFillChip,
                    reservedFor === project.title ? styles.quickFillChipActive : null,
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.quickFillChipText,
                      reservedFor === project.title ? styles.quickFillChipTextActive : null,
                    ]}>
                    {project.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <TextInput
          multiline
          onChangeText={setNotes}
          placeholder="Notes StitchSense should remember"
          placeholderTextColor="#9b867d"
          style={[styles.input, styles.notesInput]}
          value={notes}
        />

        {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> : null}
        <View style={styles.buttonRow}>
          <BrandButton label="Choose photo" onPress={() => void pickImage('library')} style={styles.rowButton} variant="ghost" />
          <BrandButton label="Take photo" onPress={() => void pickImage('camera')} style={styles.rowButton} variant="ghost" />
        </View>
        <BrandButton
          label={editingItemId ? 'Save Changes' : 'Save to Stash'}
          onPress={() => void handleSaveItem()}
          style={styles.fullWidth}
        />
        {editingItemId ? (
          <BrandButton label="Cancel editing" onPress={() => resetForm()} style={styles.fullWidth} variant="ghost" />
        ) : null}
              {editingItem ? (
                <Pressable onPress={handleRemoveEditingItem} style={styles.deleteInFormButton}>
                  <MaterialCommunityIcons color="#fffdf8" name="trash-can-outline" size={18} />
                  <Text style={styles.deleteInFormText}>Delete stash item</Text>
                </Pressable>
              ) : null}
              {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            </AppCard>
          </ScrollView>
        </View>
      </Modal>

      <View style={styles.filterBlock}>
        <Text style={styles.sectionEyebrow}>Browse</Text>
        <Text style={styles.listHeading}>Your Stash</Text>
        <View style={styles.stashHealthRow}>
          <Pressable
            onPress={() => setFilter('needs-detail')}
            style={styles.stashHealthCard}>
            <Text style={styles.stashHealthValue}>{needsDetailCount}</Text>
            <Text style={styles.stashHealthLabel}>Need details</Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter('low-stock')}
            style={styles.stashHealthCard}>
            <Text style={styles.stashHealthValue}>{lowStockCount}</Text>
            <Text style={styles.stashHealthLabel}>Low stock</Text>
          </Pressable>
        </View>
        <TextInput
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder="Search yarn, colour, fibre, hook size..."
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={query}
        />
        <View style={styles.resultRow}>
          <Text style={styles.resultSummary}>
            Showing {filteredItems.length} of {items.length} stash items
            {filter !== 'all' ? ` · ${activeFilterLabel}` : ''}
            {query.trim() ? ` · "${query.trim()}"` : ''}
          </Text>
          {filter !== 'all' || query.trim() ? (
            <Pressable
              onPress={() => {
                setFilter('all');
                setQuery('');
              }}
              style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {filteredItems.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyCopy}>
            Add a skein, hook, needle, or useful tool. Even a rough entry helps StitchSense guide future project choices.
          </Text>
        </AppCard>
      ) : (
        <View style={styles.itemList}>
          {filteredItems.map((item) => (
            <View key={item.id} style={styles.swipeShell}>
              <ScrollView
                horizontal
                bounces={false}
                decelerationRate="fast"
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                snapToEnd={false}
                snapToOffsets={[0, 96]}
                style={styles.swipeScroll}
                contentContainerStyle={styles.swipeContent}>
                <AppCard elevated style={[styles.itemCard, { width: stashCardWidth }]}>
                  <Pressable onPress={() => startEdit(item)} style={styles.itemImageButton}>
                    {stashImageSource(item) ? (
                      <Image
                        source={stashImageSource(item)}
                        style={styles.itemImage}
                        contentFit="cover"
                        cachePolicy="none"
                        recyclingKey={`${item.id}-${item.updatedAt}-${item.imageUri ?? ''}`}
                      />
                    ) : (
                      <View style={styles.itemImageFallback}>
                        <MaterialCommunityIcons
                          color={tokens.color.primary}
                          name={item.category === 'yarn' ? 'basket-outline' : 'archive-outline'}
                          size={28}
                        />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.itemBody}>
                    <Pressable onPress={() => startEdit(item)} style={styles.itemTitleBlock}>
                      <Text style={styles.itemCategory}>{categoryLabels[item.category]}</Text>
                      <Text numberOfLines={2} style={styles.itemTitle}>{item.name}</Text>
                    </Pressable>
                    <Text numberOfLines={2} style={styles.itemSummary}>{itemSummary(item)}</Text>
                    <View style={styles.cardActionRow}>
                      <Pressable
                        onPress={() =>
                          setExpandedIdeasFor((current) => (current === item.id ? null : item.id))
                        }
                        style={({ pressed }) => [styles.cardActionButton, pressed && styles.cardActionButtonPressed]}>
                        <Text style={styles.cardActionLabel}>
                          {expandedIdeasFor === item.id ? 'Hide ideas' : 'Ideas'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => askForIdeas(item)}
                        style={({ pressed }) => [
                          styles.cardActionButton,
                          styles.cardActionButtonPrimary,
                          pressed && styles.cardActionButtonPressed,
                        ]}>
                        <Text style={[styles.cardActionLabel, styles.cardActionLabelPrimary]}>Ask</Text>
                      </Pressable>
                    </View>
                    {expandedIdeasFor === item.id ? (
                      <View style={styles.ideaPanel}>
                        <Text style={styles.ideaPanelTitle}>Likely project searches</Text>
                        <View style={styles.ideaChipRow}>
                          {stashIdeaSuggestions(item).map((idea) => (
                            <Pressable
                              key={idea}
                              onPress={() => openRavelryIdeas(item, idea)}
                              style={styles.ideaChip}>
                              <Text style={styles.ideaChipText}>{idea}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.quickAdjustRow}>
                          {quickUseAmount(item) !== null ? (
                            <Pressable onPress={() => void handleUseSome(item)} style={styles.quickAdjustButton}>
                              <Text style={styles.quickAdjustLabel}>
                                Use {quickUseAmount(item)}
                                {item.unit ? ` ${item.unit}` : ''}
                              </Text>
                            </Pressable>
                          ) : null}
                          {item.reservedFor ? (
                            <Pressable onPress={() => void handleClearReservation(item)} style={styles.quickAdjustButton}>
                              <Text style={styles.quickAdjustLabel}>Clear reserve</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={() => handleRemoveItem(item)} style={styles.quickAdjustButton}>
                            <Text style={styles.removeText}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </AppCard>
                <Pressable onPress={() => handleRemoveItem(item)} style={styles.deleteRevealButton}>
                  <MaterialCommunityIcons color="#fffdf8" name="trash-can-outline" size={22} />
                  <Text style={styles.deleteRevealText}>Delete</Text>
                </Pressable>
              </ScrollView>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 0,
    gap: tokens.spacing.xl2,
    paddingBottom: tokens.spacing.xxl,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  heroStat: {
    flex: 1,
    minWidth: 92,
    minHeight: 78,
    borderRadius: tokens.radius.large,
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    padding: tokens.spacing.md,
    justifyContent: 'center',
    alignItems: 'flex-start',
    ...shadows.soft,
  },
  heroStatValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 28,
    lineHeight: 32,
  },
  heroStatLabel: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  heroActions: {
    gap: tokens.spacing.sm,
  },
  formModalScreen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  formModalContent: {
    padding: tokens.spacing.lg,
    paddingTop: tokens.spacing.xxl,
    paddingBottom: tokens.spacing.xxl,
  },
  formCard: {
    gap: tokens.spacing.md,
  },
  formModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  formModalTitleBlock: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  formModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    lineHeight: 30,
  },
  intelligenceCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#fffaf4',
    borderColor: '#dbc3ac',
  },
  reservedOverviewCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#f2f8f0',
    borderColor: 'rgba(63, 143, 85, 0.22)',
  },
  projectReadyStashCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#fffaf4',
    borderColor: '#dbc3ac',
  },
  reservedOverviewList: {
    gap: tokens.spacing.sm,
  },
  reservedOverviewRow: {
    minHeight: 62,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  reservedOverviewCopy: {
    flex: 1,
    gap: 3,
  },
  reservedOverviewTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  reservedOverviewMeta: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  intelligenceTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  intelligenceList: {
    gap: tokens.spacing.sm,
  },
  intelligenceRow: {
    minHeight: 76,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  intelligenceIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f6eadf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intelligenceCopyBlock: {
    flex: 1,
    gap: 3,
  },
  intelligenceRowTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  intelligenceCopy: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  intelligenceAction: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  segment: {
    minHeight: 42,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surfaceWarm,
  },
  segmentActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  segmentText: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#fff',
  },
  quickFillPanel: {
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#dbc3ac',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
  },
  reserveShortcutPanel: {
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#c5e1df',
    backgroundColor: '#f4fbfb',
    padding: tokens.spacing.md,
  },
  quickFillTitle: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '900',
  },
  quickFillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickFillChip: {
    maxWidth: '100%',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  quickFillChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  quickFillChipText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  quickFillChipTextActive: {
    color: '#fff',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  flexInput: {
    flex: 1,
  },
  input: {
    minHeight: 50,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    color: tokens.color.text,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 88,
    paddingVertical: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: tokens.radius.large,
    backgroundColor: tokens.color.surfaceWarm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  rowButton: {
    flex: 1,
  },
  fullWidth: {
    width: '100%',
  },
  statusText: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  deleteInFormButton: {
    minHeight: 52,
    borderRadius: tokens.radius.large,
    backgroundColor: tokens.color.danger,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  deleteInFormText: {
    color: '#fffdf8',
    fontSize: 15,
    fontWeight: '900',
  },
  filterBlock: {
    gap: tokens.spacing.md,
  },
  listHeading: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 30,
    lineHeight: 36,
  },
  stashHealthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  stashHealthCard: {
    flex: 1,
    minWidth: 92,
    minHeight: 78,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    padding: tokens.spacing.md,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 3,
    ...shadows.soft,
  },
  stashHealthValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 26,
    lineHeight: 30,
  },
  stashHealthLabel: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  filterPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    backgroundColor: tokens.color.surface,
  },
  filterPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  filterPillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  resultSummary: {
    flex: 1,
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  clearButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCard: {
    gap: tokens.spacing.xs,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  itemList: {
    gap: tokens.spacing.md,
  },
  swipeShell: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
  },
  deleteReveal: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 96,
    backgroundColor: tokens.color.danger,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  deleteRevealButton: {
    width: 96,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteRevealText: {
    color: '#fffdf8',
    fontSize: 12,
    fontWeight: '900',
  },
  swipeScroll: {
    borderRadius: 18,
  },
  swipeContent: {
    alignItems: 'stretch',
  },
  swipeSpacer: {
    width: 84,
  },
  itemCard: {
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 18,
  },
  itemImageButton: {
    borderRadius: tokens.radius.large,
  },
  itemImage: {
    width: 96,
    height: 104,
    borderRadius: tokens.radius.large,
    backgroundColor: tokens.color.surfaceWarm,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  itemImageFallback: {
    width: 96,
    height: 104,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  itemTitleBlock: {
    gap: 4,
  },
  itemCategory: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  itemTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 19,
    lineHeight: 23,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
  },
  editText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  removeText: {
    color: tokens.color.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  itemSummary: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: 2,
  },
  cardActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  cardActionButtonPrimary: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  cardActionButtonPressed: {
    opacity: 0.82,
  },
  cardActionLabel: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  cardActionLabelPrimary: {
    color: '#fffdf8',
  },
  itemSignalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  itemSignal: {
    overflow: 'hidden',
    borderRadius: tokens.radius.pill,
    backgroundColor: '#fff0de',
    color: tokens.color.warning,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '900',
  },
  itemMeta: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 19,
  },
  quickAdjustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickAdjustButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  quickAdjustLabel: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  ideaPanel: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fcf5ed',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  ideaPanelTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '900',
  },
  ideaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  ideaChip: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  ideaChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  itemNotes: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
});
