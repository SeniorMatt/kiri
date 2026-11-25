// Kiri's settings page: KWin's generic script page (config.ui + main.xml on kwinrc [Script-kiri]) with a reset
// button next to every setting and a "Reset page" button on every tab. Resetting only changes the widgets;
// Apply or OK saves, like any other change.
#include <KCModule>
#include <KConfigDialogManager>
#include <KConfigGroup>
#include <KConfigLoader>
#include <KPluginFactory>
#include <KSharedConfig>

#include <QColor>
#include <QFile>
#include <QFileInfo>
#include <QFormLayout>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QKeySequence>
#include <QLabel>
#include <QMetaProperty>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QRadioButton>
#include <QSet>
#include <QStandardPaths>
#include <QTabWidget>
#include <QToolButton>
#include <QUiLoader>
#include <QVBoxLayout>

#include <cmath>

namespace
{

// the value a widget holds, the way KConfigDialogManager reads it
struct Prop
{
    QByteArray name;
    QMetaMethod notify;
};

Prop propertyOf(QWidget *w)
{
    Prop p;
    QByteArray name = w->property("kcfg_property").toByteArray();
    if (name.isEmpty()) {
        if (qobject_cast<QPlainTextEdit *>(w)) {
            name = "plainText";
        } else if (w->inherits("QComboBox")) {
            name = "currentIndex";
        } else {
            for (const QMetaObject *m = w->metaObject(); m && name.isEmpty(); m = m->superClass()) {
                name = KConfigDialogManager::propertyMap()->value(QString::fromLatin1(m->className()));
            }
        }
    }
    if (name.isEmpty()) {
        const QMetaProperty user = w->metaObject()->userProperty();
        if (user.isValid()) {
            name = user.name();
        }
    }
    p.name = name;
    if (qobject_cast<QPlainTextEdit *>(w)) {
        p.notify = w->metaObject()->method(w->metaObject()->indexOfSignal("textChanged()"));
        return p;
    }
    QByteArray sig = w->property("kcfg_propertyNotify").toByteArray();
    if (sig.size() > 1) {
        sig = sig.mid(1); // SIGNAL() prefixes the code digit
        p.notify = w->metaObject()->method(w->metaObject()->indexOfSignal(QMetaObject::normalizedSignature(sig.constData())));
    }
    if (!p.notify.isValid()) {
        const int index = w->metaObject()->indexOfProperty(name.constData());
        if (index >= 0) {
            p.notify = w->metaObject()->property(index).notifySignal();
        }
    }
    return p;
}

// the layout (the given one or one nested in it) that holds the widget
QLayout *layoutOf(QLayout *root, QWidget *w)
{
    if (!root) {
        return nullptr;
    }
    if (root->indexOf(w) >= 0) {
        return root;
    }
    for (int i = 0; i < root->count(); ++i) {
        if (QLayout *found = layoutOf(root->itemAt(i)->layout(), w)) {
            return found;
        }
    }
    return nullptr;
}

// is the widget's value the default? Types differ (colour or key sequence widget, text in the file)
bool sameValue(QVariant value, QVariant def)
{
    if (value.metaType().id() == QMetaType::QKeySequence) {
        return value.value<QKeySequence>().toString(QKeySequence::PortableText) == def.toString();
    }
    if (value.metaType().id() == QMetaType::QColor) {
        return value.value<QColor>() == QColor(def.toString());
    }
    if (value.metaType().id() == QMetaType::Double) {
        return std::abs(value.toDouble() - def.toDouble()) < 1e-9;
    }
    if (def.metaType() != value.metaType() && !def.convert(value.metaType())) {
        return false;
    }
    return value == def;
}

} // namespace

class KiriConfig : public KCModule
{
    Q_OBJECT

public:
    KiriConfig(const QString &pluginId, QWidget *parent)
        : KCModule(parent, KPluginMetaData())
        , m_id(pluginId)
    {
        createUi();
    }

    void load() override
    {
        KCModule::load();
        refreshAll();
    }

    void defaults() override
    {
        KCModule::defaults();
        refreshAll();
    }

private Q_SLOTS:
    // a widget changed: show or hide its reset button and update its page button
    void refresh()
    {
        const auto it = m_unitOf.constFind(sender());
        if (it == m_unitOf.constEnd()) {
            return;
        }
        refreshUnit(*it);
        refreshPage(m_units[*it].page);
    }

private:
    // the widgets one reset button looks after: one setting, or a row of shortcuts, or a group of radio buttons
    struct Unit
    {
        QList<QWidget *> widgets;
        QToolButton *button = nullptr;
        int page = 0;
    };
    struct Setting
    {
        Prop prop;
        KConfigSkeletonItem *item = nullptr;
    };

    void createUi()
    {
        auto *layout = new QVBoxLayout(widget());
        auto fail = [&](const QString &text) { layout->addWidget(new QLabel(text)); };

        const QString root = QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/scripts/") + m_id, QStandardPaths::LocateDirectory);
        if (root.isEmpty()) {
            return fail(tr("Could not locate the Kiri package"));
        }
        QFile xml(root + QStringLiteral("/contents/config/main.xml"));
        QFile ui(root + QStringLiteral("/contents/ui/config.ui"));
        if (!xml.exists() || !ui.open(QFile::ReadOnly)) {
            return fail(tr("Could not read %1").arg(root));
        }

        KConfigGroup group = KSharedConfig::openConfig(QStringLiteral("kwinrc"))->group(QStringLiteral("Script-") + m_id);
        m_loader = new KConfigLoader(group, &xml, this);
        auto *loader = new QUiLoader(this);
        QWidget *form = loader->load(&ui, widget());
        if (!form) {
            return fail(tr("Error loading the settings page: %1").arg(loader->errorString()));
        }
        layout->addWidget(form);
        addConfig(m_loader, form);
        addResetButtons(form);
    }

    void addResetButtons(QWidget *form)
    {
        auto *tabs = form->findChild<QTabWidget *>();
        if (!tabs) {
            return;
        }
        m_pageUnits.resize(tabs->count());
        m_pageButtons.resize(tabs->count());

        QHash<QWidget *, int> radioUnits; // radio buttons of one group box are one setting
        const auto widgets = form->findChildren<QWidget *>();
        for (QWidget *w : widgets) {
            if (!w->objectName().startsWith(QLatin1String("kcfg_"))) {
                continue;
            }
            KConfigSkeletonItem *item = m_loader->findItemByName(w->objectName().mid(5));
            if (!item) {
                continue;
            }
            Setting s{propertyOf(w), item};
            if (s.prop.name.isEmpty()) {
                continue;
            }
            m_settings.insert(w, s);

            int page = -1;
            for (int i = 0; i < tabs->count() && page < 0; ++i) {
                if (tabs->widget(i)->isAncestorOf(w)) {
                    page = i;
                }
            }
            if (page < 0) {
                continue;
            }
            // shortcut fields sit two to a row of a grid, one button serves both
            QLayout *where = layoutOf(w->parentWidget()->layout(), w);
            auto *grid = qobject_cast<QGridLayout *>(where);
            auto *form = qobject_cast<QFormLayout *>(where);
            const bool radio = qobject_cast<QRadioButton *>(w);
            int unit = -1;
            if (grid) {
                int row, col, rs, cs;
                grid->getItemPosition(grid->indexOf(w), &row, &col, &rs, &cs);
                const QPair<QLayout *, int> key(grid, row);
                if (!m_rowUnits.contains(key)) {
                    m_rowUnits[key] = newUnit(page);
                    QToolButton *button = m_units[m_rowUnits[key]].button;
                    QSizePolicy policy = button->sizePolicy();
                    policy.setRetainSizeWhenHidden(true); // the column keeps its width
                    button->setSizePolicy(policy);
                    grid->addWidget(button, row, 3);
                }
                unit = m_rowUnits[key];
            } else if (form) {
                QWidget *group = w->parentWidget();
                if (radio && radioUnits.contains(group)) {
                    unit = radioUnits[group];
                } else {
                    unit = newUnit(page);
                    if (radio) {
                        radioUnits[group] = unit;
                    }
                    placeBeside(form, w, m_units[unit].button);
                }
            }
            if (unit < 0) {
                continue;
            }
            m_units[unit].widgets << w;
            m_unitOf.insert(w, unit);
            if (s.prop.notify.isValid()) {
                const QMetaMethod slot = metaObject()->method(metaObject()->indexOfSlot("refresh()"));
                connect(w, s.prop.notify, this, slot);
            }
        }
        for (int u = 0; u < m_units.size(); ++u) {
            connect(m_units[u].button, &QToolButton::clicked, this, [this, u] {
                resetUnit(u);
            });
        }

        // "Reset page" at the bottom right of every tab
        for (int i = 0; i < tabs->count(); ++i) {
            auto *button = new QPushButton(QIcon::fromTheme(QStringLiteral("edit-undo")), tr("Reset page"));
            button->setToolTip(tr("Reset every setting on this page to its default"));
            auto *row = new QHBoxLayout;
            row->setContentsMargins(6, 0, 6, 6);
            row->addStretch();
            row->addWidget(button);
            static_cast<QBoxLayout *>(tabs->widget(i)->layout())->addLayout(row);
            m_pageButtons[i] = button;
            connect(button, &QPushButton::clicked, this, [this, i] {
                for (int u : std::as_const(m_pageUnits[i])) {
                    resetUnit(u);
                }
            });
        }
        refreshAll();
    }

    int newUnit(int page)
    {
        Unit unit;
        unit.page = page;
        unit.button = new QToolButton;
        unit.button->setIcon(QIcon::fromTheme(QStringLiteral("edit-undo")));
        unit.button->setToolTip(tr("Reset to default"));
        unit.button->setAutoRaise(true);
        unit.button->setFocusPolicy(Qt::TabFocus);
        unit.button->setFixedSize(unit.button->sizeHint());
        // hidden while the value is the default
        unit.button->hide();
        m_units << unit;
        m_pageUnits[page] << m_units.size() - 1;
        return m_units.size() - 1;
    }

    // The button floats just right of the widget (it is not part of the layout, so the widget keeps the size it
    // has without it). The form keeps a strip free at its right edge for the button.
    void placeBeside(QFormLayout *form, QWidget *w, QToolButton *button)
    {
        if (!m_stripped.contains(form)) {
            m_stripped.insert(form);
            QMargins m = form->contentsMargins();
            form->setContentsMargins(m.left(), m.top(), m.right() + ButtonStrip, m.bottom());
        }
        button->setParent(w->parentWidget());
        m_anchors.insert(w, button);
        w->installEventFilter(this);
        place(w, button);
    }

    static void place(QWidget *w, QToolButton *button)
    {
        button->move(w->geometry().right() + 4, w->geometry().top() + (w->height() - button->sizeHint().height()) / 2);
        button->raise();
        button->setVisible(button->property("wanted").toBool() && w->isVisible());
    }

public:
    bool eventFilter(QObject *o, QEvent *e) override
    {
        switch (e->type()) {
        case QEvent::Move:
        case QEvent::Resize:
        case QEvent::Show:
        case QEvent::Hide:
        case QEvent::ParentChange: {
            const auto it = m_anchors.constFind(o);
            if (it != m_anchors.constEnd()) {
                place(static_cast<QWidget *>(o), *it);
            }
            break;
        }
        default:
            break;
        }
        return KCModule::eventFilter(o, e);
    }

private:
    bool isDefault(const QWidget *w) const
    {
        const Setting &s = m_settings[w];
        return sameValue(w->property(s.prop.name.constData()), s.item->getDefault());
    }

    bool unitIsDefault(int u) const
    {
        const auto &widgets = m_units[u].widgets;
        return std::all_of(widgets.begin(), widgets.end(), [this](QWidget *w) { return isDefault(w); });
    }

    void refreshUnit(int u)
    {
        QToolButton *button = m_units[u].button;
        button->setProperty("wanted", !unitIsDefault(u));
        if (QWidget *anchor = m_units[u].widgets.value(0); anchor && m_anchors.contains(anchor)) {
            place(anchor, button);
        } else {
            button->setVisible(button->property("wanted").toBool());
        }
    }

    void refreshPage(int page)
    {
        const auto &units = m_pageUnits[page];
        m_pageButtons[page]->setEnabled(!std::all_of(units.begin(), units.end(), [this](int u) { return unitIsDefault(u); }));
    }

    void refreshAll()
    {
        for (int u = 0; u < m_units.size(); ++u) {
            refreshUnit(u);
        }
        for (int i = 0; i < m_pageButtons.size(); ++i) {
            refreshPage(i);
        }
    }

    void resetUnit(int u)
    {
        // the radio button that is on by default goes first, the others follow its group
        auto widgets = m_units[u].widgets;
        std::stable_sort(widgets.begin(), widgets.end(), [this](QWidget *a, QWidget *b) {
            return m_settings[a].item->getDefault().toBool() > m_settings[b].item->getDefault().toBool();
        });
        for (QWidget *w : std::as_const(widgets)) {
            if (isDefault(w)) {
                continue;
            }
            const Setting &s = m_settings[w];
            QVariant def = s.item->getDefault();
            if (s.prop.name == "color") {
                def = QColor(def.toString());
            }
            w->setProperty(s.prop.name.constData(), def);
        }
        refreshUnit(u);
        refreshPage(m_units[u].page);
    }

    static constexpr int ButtonStrip = 28; // px kept free at the right of a form for the reset buttons
    QString m_id;
    QSet<QFormLayout *> m_stripped;
    QHash<const QObject *, QToolButton *> m_anchors;
    KConfigLoader *m_loader = nullptr;
    QHash<const QWidget *, Setting> m_settings;
    QHash<const QObject *, int> m_unitOf;
    QHash<QPair<QLayout *, int>, int> m_rowUnits;
    QList<Unit> m_units;
    QList<QList<int>> m_pageUnits;
    QList<QPushButton *> m_pageButtons;
};

class KiriConfigFactory : public KPluginFactory
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID "org.kde.KPluginFactory" FILE "kiri_config.json")
    Q_INTERFACES(KPluginFactory)

protected:
    QObject *create(const char *iface, QWidget *parentWidget, QObject *, const QVariantList &args) override
    {
        if (qstrcmp(iface, "KCModule") != 0 || args.isEmpty()) {
            return nullptr;
        }
        return new KiriConfig(args.at(0).toString(), parentWidget);
    }
};

#include "KiriConfig.moc"
