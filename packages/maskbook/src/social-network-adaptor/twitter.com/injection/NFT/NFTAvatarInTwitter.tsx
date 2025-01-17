import { createReactRootShadowed, MaskMessage, NFTAvatarEvent, startWatch } from '../../../../utils'
import { searchTwitterAvatarSelector } from '../../utils/selector'
import { MutationObserverWatcher } from '@dimensiondev/holoflows-kit'
import { makeStyles, useSnackbar } from '@masknet/theme'
import { useState, useEffect, useCallback } from 'react'
import { useCurrentVisitingIdentity } from '../../../../components/DataSource/useActivatedUI'

import { updateAvatarImage } from '../../utils/updateAvatarImage'
import { getAvatarId } from '../../utils/user'
import { NFTBadge } from '../../../../components/InjectedComponents/NFT/NFTBadge'
import { saveNFTAvatar, setOrClearAvatar } from '../../../../components/InjectedComponents/NFT/gun'
import { useNFTAvatar } from '../../../../components/InjectedComponents/NFT/hooks'
import type { AvatarMetaDB } from '../../../../components/InjectedComponents/NFT/types'

export function injectNFTAvatarInTwitter(signal: AbortSignal) {
    const watcher = new MutationObserverWatcher(searchTwitterAvatarSelector())
    startWatch(watcher, signal)
    createReactRootShadowed(watcher.firstDOMProxy.afterShadow, { signal }).render(<NFTAvatarInTwitter />)
}

const useStyles = makeStyles()((theme) => ({
    root: {
        position: 'absolute',
        bottom: '-10px !important',
        left: 0,
        textAlign: 'center',
        color: 'white',
        transform: 'scale(1) !important',
        minWidth: 134,
    },
    text: {
        fontSize: '20px !important',
        fontWeight: 700,
    },
    icon: {
        width: '19px !important',
        height: '19px !important',
    },
}))

interface NFTAvatarInTwitterProps {}
function NFTAvatarInTwitter(props: NFTAvatarInTwitterProps) {
    const { classes } = useStyles()
    const identity = useCurrentVisitingIdentity()
    const [amount, setAmount] = useState('')
    const _avatar = useNFTAvatar(identity.identifier.userId)
    const { enqueueSnackbar } = useSnackbar()
    const [avatar, setAvatar] = useState<AvatarMetaDB | undefined>(_avatar)
    const getParentDom = () =>
        searchTwitterAvatarSelector().querySelector<HTMLElement>('div > :nth-child(2) > div').evaluate()
    const [avatarId, setAvatarId] = useState('')

    const onUpdate = useCallback(
        (data: NFTAvatarEvent) => {
            saveNFTAvatar(data.userId, data.avatarId, data.address, data.tokenId)
                .then((avatar: AvatarMetaDB) => {
                    const parent = getParentDom()
                    if (!parent) return
                    updateAvatarImage(parent, avatar.image ?? '')
                    setAmount(avatar.amount)
                    setAvatar(avatar)
                })
                .catch((error: Error) => {
                    enqueueSnackbar(error.message, { variant: 'error' })
                })
        },
        [enqueueSnackbar],
    )

    useEffect(() => {
        return MaskMessage.events.NFTAvatarUpdated.on((data) => {
            onUpdate(data)
        })
    }, [onUpdate])

    useEffect(() => {
        const _avatarId = getAvatarId(identity.avatar ?? '')
        setAvatarId(_avatarId)
    }, [identity, identity.avatar])

    useEffect(() => {
        setAvatar(_avatar)
        const parent = getParentDom()
        if (!parent) return
        if (!_avatar) return
        setAmount(_avatar?.amount ?? '0')
        updateAvatarImage(parent, _avatar?.image ?? '')
    }, [_avatar])

    const onClick = async () => {
        const parent = getParentDom()
        if (!parent) return
        await setOrClearAvatar(identity.identifier.userId)
        updateAvatarImage(parent)
        setAvatar(undefined)
    }

    if (!avatar) return null
    return (
        <>
            {avatarId === avatar.avatarId ? (
                <NFTBadge
                    avatar={avatar}
                    size={14}
                    classes={{ root: classes.root, text: classes.text, icon: classes.icon }}
                />
            ) : null}
        </>
    )
}
