'use client';

import React from 'react';
import { useRoomStore } from '@/stores/roomStore';
import { LivingRoomFurniture } from './LivingRoomFurniture';
import { BedroomFurniture } from './BedroomFurniture';
import { KitchenFurniture } from './KitchenFurniture';
import { BathroomFurniture } from './BathroomFurniture';
import { DiningFurniture } from './DiningFurniture';
import { BalconyFurniture } from './BalconyFurniture';
import { StaircaseFurniture } from './StaircaseFurniture';

export function FurnitureSystem() {
  const { roomType, lengthFt, widthFt, heightFt } = useRoomStore();

  switch (roomType) {
    case 'living-room':
      return <LivingRoomFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'bedroom':
      return <BedroomFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'kitchen':
      return <KitchenFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'bathroom':
      return <BathroomFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'dining-room':
      return <DiningFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'outdoor':
      return <BalconyFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    case 'staircase':
      return <StaircaseFurniture lengthFt={lengthFt} widthFt={widthFt} heightFt={heightFt} />;
    default:
      return null;
  }
}
