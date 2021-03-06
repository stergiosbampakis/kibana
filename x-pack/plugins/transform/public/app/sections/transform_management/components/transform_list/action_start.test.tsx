/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { shallow } from 'enzyme';
import React from 'react';

import { Providers } from '../../../../app_dependencies.mock';

import { TransformListRow } from '../../../../common';
import { StartAction } from './action_start';

import transformListRow from '../../../../common/__mocks__/transform_list_row.json';

jest.mock('ui/new_platform');
jest.mock('../../../../../shared_imports');

describe('Transform: Transform List Actions <StartAction />', () => {
  test('Minimal initialization', () => {
    const item: TransformListRow = transformListRow;
    const props = {
      disabled: false,
      items: [item],
      startTransform(d: TransformListRow) {},
    };

    const wrapper = shallow(
      <Providers>
        <StartAction {...props} />
      </Providers>
    )
      .find(StartAction)
      .shallow();

    expect(wrapper).toMatchSnapshot();
  });
});
